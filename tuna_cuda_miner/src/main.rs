use rustacuda::prelude::*;
use rustacuda::memory::DeviceBox;
use rustacuda::event::{Event, EventFlags};
use rustacuda::launch;

use std::ffi::CString;
use std::{env, thread};
use cardano_multiplatform_lib::{self, plutus::{encode_json_str_to_plutus_datum, PlutusDatumSchema}};
use serde::Serialize;
use regex::Regex;
use rand::RngCore;
use reqwest::{self, Error};
use arrayref::array_ref;

use std::time::Instant;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::process::exit;


const BLOCK_SIZE: u32 = 256;
const NUMBLOCKS: u32 = 163834;
const ITERATIONS_PER_KERNEL: u32 = 100;
const IDX_MULTIPLIER: u64 = (NUMBLOCKS * BLOCK_SIZE * ITERATIONS_PER_KERNEL) as u64;

const SHOW_INTERVAL_MS: u128 = 2000;

fn main() -> Result<(), rustacuda::error::CudaError> {
    rustacuda::init(CudaFlags::empty())?;
    let device = Device::get_device(0).unwrap();
    let _context = Context::create_and_push(ContextFlags::MAP_HOST | ContextFlags::SCHED_AUTO, device).unwrap();
    let server_url_arg = env::args().nth(1).unwrap_or_else(|| "http://localhost:8008".to_string());
    let server_url_clone = server_url_arg.clone();

    let json_arc = Arc::new(Mutex::new(String::from(
        r#"{"fields":[{"bytes":"2c58571ed350979233da4dea0846ff50"},{"int":7745},{"bytes":"0000003ae1a0f5771417fe0ca2865f93a0ff6d2534037570fc5e258ca9213845"},{"int":66},{"int":555},{"int":61545000}],"constructor":0}"#,
    )));

    let should_terminate = Arc::new(AtomicBool::new(false));
    let should_terminate_clone = Arc::clone(&should_terminate);

    let json_arc_clone = Arc::clone(&json_arc);
    thread::spawn(move || {
        loop {
            // checks for json update every second
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let new_json = fetch_url(&server_url_clone).unwrap().clone();
            let mut json = json_arc_clone.lock().unwrap();
            if new_json != *json {
                *json = new_json;
                should_terminate_clone.store(true, Ordering::SeqCst);
            }
        }
    });

    loop {
        // Call new worker function
        {
            let json_clone = json_arc.lock().unwrap().clone();
            let stream = Stream::new(StreamFlags::NON_BLOCKING, None)?;
            let response = worker(&json_clone, &stream, Arc::clone(&should_terminate));

            // Check and process the result
            if let Some(answer) = response {
                println!("Found a solution!");
                post_answer(&format!("{}/submit", server_url_arg), &answer).unwrap();
            }
        }

        if should_terminate.load(Ordering::SeqCst) {
            should_terminate.store(false, Ordering::SeqCst);
        }
    }
}

#[derive(Serialize)]
struct FoundAnswerResponse {
    nonce: Vec<u8>,
    answer: Vec<u8>,
    difficulty: u128,
    zeroes: u128
}

fn worker(json: &str, stream: &Stream, should_terminate: Arc<AtomicBool>) -> Option<FoundAnswerResponse> {

    let mut last_time_state_updated = Instant::now();
    let mut last_nonce_since_update: u64 = 0;


    let fields = extract_fields(json);

    let result = encode_json_str_to_plutus_datum(json, PlutusDatumSchema::DetailedSchema).unwrap();
    let constr = match result.as_constr_plutus_data() {
        Some(constr) => constr,
        None => panic!("Error converting to PlutusConstrData."),
    };
    let bytes = constr.to_bytes();

    let expected_zeroes = match &fields[3] {
        FieldValue::Int(value) => value,
        _ => panic!("Expected a FieldValue::Int"),
    };

    let expected_diff = match &fields[4] {
        FieldValue::Int(value) => value,
        _ => panic!("Expected a FieldValue::Int"),
    };

    // Convert nonce from hexadecimal to binary and then split into nonce_low and nonce_high parts
    let mut rng = rand::thread_rng();
    let mut nonce = [0u8; 16];
    rng.fill_bytes(&mut nonce);
    let nonce_bin = nonce;
    let mut nonce_low = u64::from_le_bytes(*array_ref![nonce_bin, 0, 8]);  // Slice first eight bytes
    let mut nonce_high = u64::from_le_bytes(*array_ref![nonce_bin, 8, 8]); // Slice second eight bytes

    // Convert hex_datum to binary
    let your_byte_array = bytes;
    let mut device_buffer = DeviceBuffer::from_slice(&your_byte_array).unwrap();

    let mut g_nonce_low = DeviceBox::new(&nonce_low).unwrap();
    let mut g_nonce_high = DeviceBox::new(&nonce_high).unwrap();
    let mut g_hash_out = DeviceBox::new(&[0u8; 32]).unwrap();
    let mut g_found = DeviceBox::new(&0).unwrap();

    let event = Event::new(EventFlags::DEFAULT).unwrap();

    let module_data = CString::new(include_str!("../resources/main.ptx")).unwrap();
    let module = Module::load_from_string(&module_data).unwrap();

    let mut g_found_host: u32 = 0;

    while g_found_host == 0 && !should_terminate.load(Ordering::SeqCst) {
        g_nonce_low = DeviceBox::new(&nonce_low).unwrap();
        g_nonce_high = DeviceBox::new(&nonce_high).unwrap();
        unsafe {
            launch!(module.sha256_kernel<<<NUMBLOCKS, BLOCK_SIZE, 0, stream>>>(
                    g_nonce_low.as_device_ptr(),
                    g_nonce_high.as_device_ptr(),
                    g_hash_out.as_device_ptr(),
                    g_found.as_device_ptr(),
                    device_buffer.as_device_ptr(),
                    your_byte_array.len(),
                    *expected_diff,
                    nonce_low,
                    nonce_high
                )).unwrap();

            event.record(&stream).unwrap();
        }

        event.synchronize().unwrap();
        g_found.copy_to(&mut g_found_host).unwrap();

        nonce_low += IDX_MULTIPLIER;
        if nonce_low < IDX_MULTIPLIER {
            nonce_high += 1;
        }

        let now = Instant::now();
        let duration_since_last_update = now.duration_since(last_time_state_updated);
        if duration_since_last_update.as_millis() > SHOW_INTERVAL_MS {
            let total_duration = now.duration_since(last_time_state_updated);
            let total_duration_in_seconds = total_duration.as_secs() as f64 + total_duration.subsec_millis() as f64 * 1e-3;
            let hash_rate = (nonce_low - last_nonce_since_update) as f64 / total_duration_in_seconds;

            println!("Hash rate: {} hash(es)/s", hash_rate);

            last_nonce_since_update = nonce_low;
            last_time_state_updated = now;
        }
        if should_terminate.load(Ordering::SeqCst) {
            println!("Updated! New hashing cycle beginning now.");
            return None; // Terminate function if should_terminate is true
        }
    }

    g_nonce_low.copy_to(&mut nonce_low).unwrap();
    g_nonce_high.copy_to(&mut nonce_high).unwrap();

    let mut host_hash_out = [0u8; 32];
    g_hash_out.copy_to(&mut host_hash_out).unwrap();

    let mut host_found: u32 = 0;
    g_found.copy_to(&mut host_found).unwrap();

    let (zeroes, difficulty) = get_difficulty(&host_hash_out);

    if host_found > 0 {
        if zeroes > *expected_zeroes as u128 || (zeroes == *expected_zeroes as u128 && difficulty  < *expected_diff  as u128) {
            return Some(FoundAnswerResponse {
                nonce: nonce[0..16].to_vec(),
                answer: host_hash_out.to_vec(),
                difficulty: difficulty,
                zeroes: zeroes
            });
        }
    }

    if should_terminate.load(Ordering::SeqCst) {
        println!("Terminated by signal");
    }
    // Return None if no solution found
    None
}

#[derive(Debug)]
enum FieldValue {
    Bytes(String),
    Int(i32),
}

pub fn get_difficulty(hash: &[u8]) -> (u128, u128) {
    // If you want to check that the Vec is the expected length:
    if hash.len() != 32 {
        panic!("Expected a hash of length 32, but got {}", hash.len());
    }

    let mut leading_zeros = 0;
    let mut difficulty_number = 0;

    for (indx, &chr) in hash.iter().enumerate() {
        if chr != 0 {
            if (chr & 0x0F) == chr {
                leading_zeros += 1;
                difficulty_number += (chr as u128) * 4096;
                difficulty_number += (hash[indx + 1] as u128) * 16;
                difficulty_number += (hash[indx + 2] as u128) / 16;
                return (leading_zeros, difficulty_number);
            } else {
                difficulty_number += (chr as u128) * 256;
                difficulty_number += hash[indx + 1] as u128;
                return (leading_zeros, difficulty_number);
            }
        } else {
            leading_zeros += 2;
        }
    }
    (32, 0)
}

fn extract_fields(input: &str) -> Vec<FieldValue> {
    let re = Regex::new(r#"(?:"bytes":"([^"]+)"|"int":(\d+))"#).unwrap();
    re.captures_iter(input)
        .filter_map(|cap| {
            if let Some(val) = cap.get(1) {
                Some(FieldValue::Bytes(val.as_str().to_string()))
            } else {
                cap.get(2).map(|val| FieldValue::Int(val.as_str().parse().unwrap()))
            }
        })
        .collect()
}

fn fetch_url(url: &str) -> Result<String, Error> {
    match reqwest::blocking::get(url) {
        Ok(response) => Ok(response.text()?),
        Err(_err) => {
            eprintln!("Server failed to connect");
            exit(0);
        }
    }
}
fn post_answer(url: &str, answer: &FoundAnswerResponse) -> Result<(), Error> {
    let client = reqwest::blocking::Client::new();
    client.post(url)
        .json(answer)
        .send()?;

    Ok(())
}
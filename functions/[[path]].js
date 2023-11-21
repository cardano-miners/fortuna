var manifest = {
	"/*404": {
	type: "route",
	script: {
		type: "script",
		href: "/assets/_...404_-03ef389a.js"
	},
	assets: [
		{
			type: "script",
			href: "/assets/_...404_-03ef389a.js"
		},
		{
			type: "script",
			href: "/assets/entry-client-b513c3be.js"
		},
		{
			type: "style",
			href: "/assets/entry-client-3ccd35e0.css"
		}
	]
},
	"/about": {
	type: "route",
	script: {
		type: "script",
		href: "/assets/about-013203ca.js"
	},
	assets: [
		{
			type: "script",
			href: "/assets/about-013203ca.js"
		},
		{
			type: "script",
			href: "/assets/entry-client-b513c3be.js"
		},
		{
			type: "style",
			href: "/assets/entry-client-3ccd35e0.css"
		},
		{
			type: "script",
			href: "/assets/Counter-d0d2ac25.js"
		}
	]
},
	"/": {
	type: "route",
	script: {
		type: "script",
		href: "/assets/index-ca786a5e.js"
	},
	assets: [
		{
			type: "script",
			href: "/assets/index-ca786a5e.js"
		},
		{
			type: "script",
			href: "/assets/entry-client-b513c3be.js"
		},
		{
			type: "style",
			href: "/assets/entry-client-3ccd35e0.css"
		},
		{
			type: "script",
			href: "/assets/Counter-d0d2ac25.js"
		}
	]
},
	"entry-client": {
	type: "entry",
	script: {
		type: "script",
		href: "/assets/entry-client-b513c3be.js"
	},
	assets: [
		{
			type: "script",
			href: "/assets/entry-client-b513c3be.js"
		},
		{
			type: "style",
			href: "/assets/entry-client-3ccd35e0.css"
		}
	]
},
	"index.html": {
	type: "entry",
	assets: [
	]
}
};

const ERROR = Symbol("error");
function castError(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error", {
    cause: err
  });
}
function handleError(err, owner = Owner) {
  const fns = owner && owner.context && owner.context[ERROR];
  const error = castError(err);
  if (!fns) throw error;
  try {
    for (const f of fns) f(error);
  } catch (e) {
    handleError(e, owner && owner.owner || null);
  }
}
const UNOWNED = {
  context: null,
  owner: null,
  owned: null,
  cleanups: null
};
let Owner = null;
function createOwner() {
  const o = {
    owner: Owner,
    context: Owner ? Owner.context : null,
    owned: null,
    cleanups: null
  };
  if (Owner) {
    if (!Owner.owned) Owner.owned = [o];else Owner.owned.push(o);
  }
  return o;
}
function createRoot(fn, detachedOwner) {
  const owner = Owner,
    current = detachedOwner === undefined ? owner : detachedOwner,
    root = fn.length === 0 ? UNOWNED : {
      context: current ? current.context : null,
      owner: current,
      owned: null,
      cleanups: null
    };
  Owner = root;
  let result;
  try {
    result = fn(fn.length === 0 ? () => {} : () => cleanNode(root));
  } catch (err) {
    handleError(err);
  } finally {
    Owner = owner;
  }
  return result;
}
function createSignal(value, options) {
  return [() => value, v => {
    return value = typeof v === "function" ? v(value) : v;
  }];
}
function createComputed(fn, value) {
  Owner = createOwner();
  try {
    fn(value);
  } catch (err) {
    handleError(err);
  } finally {
    Owner = Owner.owner;
  }
}
const createRenderEffect = createComputed;
function createMemo(fn, value) {
  Owner = createOwner();
  let v;
  try {
    v = fn(value);
  } catch (err) {
    handleError(err);
  } finally {
    Owner = Owner.owner;
  }
  return () => v;
}
function batch(fn) {
  return fn();
}
const untrack = batch;
function on(deps, fn, options = {}) {
  const isArray = Array.isArray(deps);
  const defer = options.defer;
  return () => {
    if (defer) return undefined;
    let value;
    if (isArray) {
      value = [];
      for (let i = 0; i < deps.length; i++) value.push(deps[i]());
    } else value = deps();
    return fn(value);
  };
}
function onCleanup(fn) {
  if (Owner) {
    if (!Owner.cleanups) Owner.cleanups = [fn];else Owner.cleanups.push(fn);
  }
  return fn;
}
function cleanNode(node) {
  if (node.owned) {
    for (let i = 0; i < node.owned.length; i++) cleanNode(node.owned[i]);
    node.owned = null;
  }
  if (node.cleanups) {
    for (let i = 0; i < node.cleanups.length; i++) node.cleanups[i]();
    node.cleanups = null;
  }
}
function catchError(fn, handler) {
  const owner = createOwner();
  owner.context = {
    ...owner.context,
    [ERROR]: [handler]
  };
  Owner = owner;
  try {
    return fn();
  } catch (err) {
    handleError(err);
  } finally {
    Owner = Owner.owner;
  }
}
function createContext(defaultValue) {
  const id = Symbol("context");
  return {
    id,
    Provider: createProvider(id),
    defaultValue
  };
}
function useContext(context) {
  return Owner && Owner.context && Owner.context[context.id] !== undefined ? Owner.context[context.id] : context.defaultValue;
}
function getOwner() {
  return Owner;
}
function children(fn) {
  const memo = createMemo(() => resolveChildren(fn()));
  memo.toArray = () => {
    const c = memo();
    return Array.isArray(c) ? c : c != null ? [c] : [];
  };
  return memo;
}
function runWithOwner(o, fn) {
  const prev = Owner;
  Owner = o;
  try {
    return fn();
  } catch (err) {
    handleError(err);
  } finally {
    Owner = prev;
  }
}
function resolveChildren(children) {
  if (typeof children === "function" && !children.length) return resolveChildren(children());
  if (Array.isArray(children)) {
    const results = [];
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i]);
      Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
    }
    return results;
  }
  return children;
}
function createProvider(id) {
  return function provider(props) {
    return createMemo(() => {
      Owner.context = {
        ...Owner.context,
        [id]: props.value
      };
      return children(() => props.children);
    });
  };
}

function resolveSSRNode$1(node) {
  const t = typeof node;
  if (t === "string") return node;
  if (node == null || t === "boolean") return "";
  if (Array.isArray(node)) {
    let mapped = "";
    for (let i = 0, len = node.length; i < len; i++) mapped += resolveSSRNode$1(node[i]);
    return mapped;
  }
  if (t === "object") return node.t;
  if (t === "function") return resolveSSRNode$1(node());
  return String(node);
}
const sharedConfig = {};
function setHydrateContext(context) {
  sharedConfig.context = context;
}
function nextHydrateContext() {
  return sharedConfig.context ? {
    ...sharedConfig.context,
    id: `${sharedConfig.context.id}${sharedConfig.context.count++}-`,
    count: 0
  } : undefined;
}
function createUniqueId() {
  const ctx = sharedConfig.context;
  if (!ctx) throw new Error(`createUniqueId cannot be used under non-hydrating context`);
  return `${ctx.id}${ctx.count++}`;
}
function createComponent(Comp, props) {
  if (sharedConfig.context && !sharedConfig.context.noHydrate) {
    const c = sharedConfig.context;
    setHydrateContext(nextHydrateContext());
    const r = Comp(props || {});
    setHydrateContext(c);
    return r;
  }
  return Comp(props || {});
}
function mergeProps(...sources) {
  const target = {};
  for (let i = 0; i < sources.length; i++) {
    let source = sources[i];
    if (typeof source === "function") source = source();
    if (source) {
      const descriptors = Object.getOwnPropertyDescriptors(source);
      for (const key in descriptors) {
        if (key in target) continue;
        Object.defineProperty(target, key, {
          enumerable: true,
          get() {
            for (let i = sources.length - 1; i >= 0; i--) {
              let v,
                s = sources[i];
              if (typeof s === "function") s = s();
              v = (s || {})[key];
              if (v !== undefined) return v;
            }
          }
        });
      }
    }
  }
  return target;
}
function splitProps(props, ...keys) {
  const descriptors = Object.getOwnPropertyDescriptors(props),
    split = k => {
      const clone = {};
      for (let i = 0; i < k.length; i++) {
        const key = k[i];
        if (descriptors[key]) {
          Object.defineProperty(clone, key, descriptors[key]);
          delete descriptors[key];
        }
      }
      return clone;
    };
  return keys.map(split).concat(split(Object.keys(descriptors)));
}
function Show(props) {
  let c;
  return props.when ? typeof (c = props.children) === "function" ? c(props.keyed ? props.when : () => props.when) : c : props.fallback || "";
}
function ErrorBoundary$1(props) {
  let error,
    res,
    clean,
    sync = true;
  const ctx = sharedConfig.context;
  const id = ctx.id + ctx.count;
  function displayFallback() {
    cleanNode(clean);
    ctx.serialize(id, error);
    setHydrateContext({
      ...ctx,
      count: 0
    });
    const f = props.fallback;
    return typeof f === "function" && f.length ? f(error, () => {}) : f;
  }
  createMemo(() => {
    clean = Owner;
    return catchError(() => res = props.children, err => {
      error = err;
      !sync && ctx.replace("e" + id, displayFallback);
      sync = true;
    });
  });
  if (error) return displayFallback();
  sync = false;
  return {
    t: `<!--!$e${id}-->${resolveSSRNode$1(res)}<!--!$/e${id}-->`
  };
}
const SuspenseContext = createContext();
function suspenseComplete(c) {
  for (const r of c.resources.values()) {
    if (r.loading) return false;
  }
  return true;
}
function startTransition(fn) {
  fn();
}
function Suspense(props) {
  let done;
  const ctx = sharedConfig.context;
  const id = ctx.id + ctx.count;
  const o = createOwner();
  const value = ctx.suspense[id] || (ctx.suspense[id] = {
    resources: new Map(),
    completed: () => {
      const res = runSuspense();
      if (suspenseComplete(value)) {
        done(resolveSSRNode$1(res));
      }
    }
  });
  function suspenseError(err) {
    if (!done || !done(undefined, err)) {
      runWithOwner(o.owner, () => {
        throw err;
      });
    }
  }
  function runSuspense() {
    setHydrateContext({
      ...ctx,
      count: 0
    });
    cleanNode(o);
    return runWithOwner(o, () => createComponent(SuspenseContext.Provider, {
      value,
      get children() {
        return catchError(() => props.children, suspenseError);
      }
    }));
  }
  const res = runSuspense();
  if (suspenseComplete(value)) {
    delete ctx.suspense[id];
    return res;
  }
  done = ctx.async ? ctx.registerFragment(id) : undefined;
  return catchError(() => {
    if (ctx.async) {
      setHydrateContext({
        ...ctx,
        count: 0,
        id: ctx.id + "0-f",
        noHydrate: true
      });
      const res = {
        t: `<template id="pl-${id}"></template>${resolveSSRNode$1(props.fallback)}<!--pl-${id}-->`
      };
      setHydrateContext(ctx);
      return res;
    }
    setHydrateContext({
      ...ctx,
      count: 0,
      id: ctx.id + "0-f"
    });
    ctx.serialize(id, "$$f");
    return props.fallback;
  }, suspenseError);
}

var{toString:Ye}=Object.prototype,m=class extends Error{constructor(r){super('Unsupported type "'+Ye.call(r)+'"');this.value=r;}};function S(a,e){if(!a)throw e}var we={0:"Symbol.asyncIterator",1:"Symbol.hasInstance",2:"Symbol.isConcatSpreadable",3:"Symbol.iterator",4:"Symbol.match",5:"Symbol.matchAll",6:"Symbol.replace",7:"Symbol.search",8:"Symbol.species",9:"Symbol.split",10:"Symbol.toPrimitive",11:"Symbol.toStringTag",12:"Symbol.unscopables"},ce={[Symbol.asyncIterator]:0,[Symbol.hasInstance]:1,[Symbol.isConcatSpreadable]:2,[Symbol.iterator]:3,[Symbol.match]:4,[Symbol.matchAll]:5,[Symbol.replace]:6,[Symbol.search]:7,[Symbol.species]:8,[Symbol.split]:9,[Symbol.toPrimitive]:10,[Symbol.toStringTag]:11,[Symbol.unscopables]:12},Ie={2:"!0",3:"!1",1:"void 0",0:"null",4:"-0",5:"1/0",6:"-1/0",7:"0/0"};var Z={0:"Error",1:"EvalError",2:"RangeError",3:"ReferenceError",4:"SyntaxError",5:"TypeError",6:"URIError"},u=Symbol("why");function R(a){return {t:2,i:void 0,s:a,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}var Q=R(2),ee=R(3),re=R(1),E=R(0),ze=R(4),Te=R(5),Be=R(6),De=R(7);function Je(a){switch(a){case'"':return '\\"';case"\\":return "\\\\";case`
`:return "\\n";case"\r":return "\\r";case"\b":return "\\b";case"	":return "\\t";case"\f":return "\\f";case"<":return "\\x3C";case"\u2028":return "\\u2028";case"\u2029":return "\\u2029";default:return}}function l(a){let e="",r=0,t;for(let n=0,s=a.length;n<s;n++)t=Je(a[n]),t&&(e+=a.slice(r,n)+t,r=n+1);return r===0?e=a:e+=a.slice(r),e}var x="__SEROVAL_REFS__",b="_$",k="$R",pe="s",me="f",ge="P",he="Ps",ve="Pf",Se="c",be="S",H="Se",Ve=`self.${b}`,Ze=`${Ve}=${Ve}||{${ge}:function(s,f,p){return(p=new Promise(function(a,b){s=a,f=b})).${pe}=s,p.${me}=f,p},uP:function(p){delete p.${pe};delete p.${me}},${he}:function(p,d){p.${pe}(d),p.status="success",p.value=d,this.uP(p)},${ve}:function(p,d){p.${me}(d),p.status="failure",p.value=d,this.uP(p)},uS:function(s){delete s.${Se}},${H}:function(s,t,d,c){switch(c=s.${Se},t){case 0:return c.enqueue(d);case 1:return(this.uS(s),c.error(d));case 2:return(this.uS(s),c.close())}},${be}:function(s,c){return(s=new ReadableStream({start:function(x){c=x}})).${Se}=c,s}}`,te=`self.${k}`;function Qe(a){return a==null?`${te}=${te}||[];`:`(${te}=${te}||{})["${l(a)}"]=[];`}var ye=new Map,A$2=new Map;function P(a){return ye.has(a)}function Le(a){return S(P(a),new Error("Missing reference id")),ye.get(a)}typeof globalThis!==void 0?Object.defineProperty(globalThis,x,{value:A$2,configurable:!0,writable:!1,enumerable:!1}):typeof window!==void 0?Object.defineProperty(window,x,{value:A$2,configurable:!0,writable:!1,enumerable:!1}):typeof self!==void 0?Object.defineProperty(self,x,{value:A$2,configurable:!0,writable:!1,enumerable:!1}):typeof global!==void 0&&Object.defineProperty(global,x,{value:A$2,configurable:!0,writable:!1,enumerable:!1});function ne(a){switch(a){case 1/0:return Te;case-1/0:return Be;default:return a!==a?De:Object.is(a,-0)?ze:{t:0,i:void 0,s:a,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}}function se(a){return {t:1,i:void 0,s:l(a),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function ae(a){return {t:3,i:void 0,s:""+a,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function Ne(a){return {t:4,i:a,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function z(a,e){return {t:5,i:a,s:e.toISOString(),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,f:void 0,a:void 0,b:void 0,o:void 0}}function T(a,e){return {t:6,i:a,s:void 0,l:void 0,c:e.source,m:e.flags,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function B(a,e){let r=new Uint8Array(e),t=r.length,n=new Array(t);for(let s=0;s<t;s++)n[s]=r[s];return {t:21,i:a,s:n,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function ie(a,e){return S(e in ce,new Error("Only well-known symbols are supported.")),{t:17,i:a,s:ce[e],l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function Re(a,e){return {t:20,i:a,s:l(Le(e)),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function D(a,e,r){return {t:40,i:a,s:r,l:void 0,c:l(e),m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}var v=(f=>(f[f.AggregateError=1]="AggregateError",f[f.ArrayPrototypeValues=2]="ArrayPrototypeValues",f[f.ArrowFunction=4]="ArrowFunction",f[f.BigInt=8]="BigInt",f[f.ErrorPrototypeStack=16]="ErrorPrototypeStack",f[f.Map=32]="Map",f[f.MethodShorthand=64]="MethodShorthand",f[f.ObjectAssign=128]="ObjectAssign",f[f.Promise=256]="Promise",f[f.Set=512]="Set",f[f.Symbol=1024]="Symbol",f[f.TypedArray=2048]="TypedArray",f[f.BigIntTypedArray=4096]="BigIntTypedArray",f[f.WebAPI=8192]="WebAPI",f))(v||{});function oe(a,e){return {body:e,cache:a.cache,credentials:a.credentials,headers:a.headers,integrity:a.integrity,keepalive:a.keepalive,method:a.method,mode:a.mode,redirect:a.redirect,referrer:a.referrer,referrerPolicy:a.referrerPolicy}}function de(a){return {headers:a.headers,status:a.status,statusText:a.statusText}}function le(a){return {bubbles:a.bubbles,cancelable:a.cancelable,composed:a.composed}}function ue(a){return {detail:a.detail,bubbles:a.bubbles,cancelable:a.cancelable,composed:a.composed}}var V=class{constructor(e){this.marked=new Set;this.plugins=e.plugins,this.features=16383^(e.disabledFeatures||0),this.refs=e.refs||new Map;}markRef(e){this.marked.add(e);}isMarked(e){return this.marked.has(e)}getReference(e){let r=this.refs.get(e);if(r!=null)return this.markRef(r),Ne(r);let t=this.refs.size;return this.refs.set(e,t),P(e)?Re(t,e):t}getStrictReference(e){let r=this.refs.get(e);if(r!=null)return this.markRef(r),Ne(r);let t=this.refs.size;return this.refs.set(e,t),Re(t,e)}isIterable(e){if(!e||typeof e!="object"||Array.isArray(e))return !1;let r=e.constructor,t=this.features;if(t&2048)switch(r){case Int8Array:case Int16Array:case Int32Array:case Uint8Array:case Uint16Array:case Uint32Array:case Uint8ClampedArray:case Float32Array:case Float64Array:return !1;}if((t&4104)===4104)switch(r){case BigInt64Array:case BigUint64Array:return !1;}if(t&32&&r===Map||t&512&&r===Set||t&8192&&(typeof Headers!="undefined"&&r===Headers||typeof File!="undefined"&&r===File))return !1;let n=this.plugins;if(n)for(let s=0,i=n.length;s<i;s++){let o=n[s];if(o.test(e)&&o.isIterable&&o.isIterable(e))return !1}return t&1024?Symbol.iterator in e:!1}};function K(a){return a instanceof EvalError?1:a instanceof RangeError?2:a instanceof ReferenceError?3:a instanceof SyntaxError?4:a instanceof TypeError?5:a instanceof URIError?6:0}var nr=/^[$A-Z_][0-9A-Z_$]*$/i;function xe(a){let e=a[0];return (e==="$"||e==="_"||e>="A"&&e<="Z"||e>="a"&&e<="z")&&nr.test(a)}function L(a){return Object.isFrozen(a)?3:Object.isSealed(a)?2:Object.isExtensible(a)?0:1}function F(a,e){let r,t=Z[K(a)];a.name!==t?r={name:a.name}:a.constructor.name!==t&&(r={name:a.constructor.name});let n=Object.getOwnPropertyNames(a);for(let s=0,i=n.length,o;s<i;s++)o=n[s],o!=="name"&&o!=="message"&&(o==="stack"?e&16&&(r=r||{},r[o]=a[o]):(r=r||{},r[o]=a[o]));return r}function U(a,e){return {t:18,i:a,s:l(e.href),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,f:void 0,a:void 0,b:void 0,o:void 0}}function M(a,e){return {t:19,i:a,s:l(e.toString()),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,f:void 0,a:void 0,b:void 0,o:void 0}}function j(a,e){return {t:39,i:a,s:l(e.message),l:void 0,c:l(e.name),m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}function W(a){switch(a.t){case"index":return a.s+"="+a.v;case"set":return a.s+".set("+a.k+","+a.v+")";case"add":return a.s+".add("+a.v+")";case"delete":return a.s+".delete("+a.k+")";default:return ""}}function ar(a){let e=[],r=a[0];for(let t=1,n=a.length,s,i=r;t<n;t++)s=a[t],s.t==="index"&&s.v===i.v?r={t:"index",s:s.s,k:void 0,v:W(r)}:s.t==="set"&&s.s===i.s?r={t:"set",s:W(r),k:s.k,v:s.v}:s.t==="add"&&s.s===i.s?r={t:"add",s:W(r),k:void 0,v:s.v}:s.t==="delete"&&s.s===i.s?r={t:"delete",s:W(r),k:s.k,v:void 0}:(e.push(r),r=s),i=s;return e.push(r),e}function _e(a){if(a.length){let e="",r=ar(a);for(let t=0,n=r.length;t<n;t++)e+=W(r[t])+",";return e}}var ir="Object.create(null)",or="new Set",dr="new Map",lr="Promise.resolve",ur="Promise.reject",qe="Symbol.iterator";var fr={0:"[]"},cr={3:"Object.freeze",2:"Object.seal",1:"Object.preventExtensions",0:void 0},O=class{constructor(e){this.stack=[];this.flags=[];this.assignments=[];this.specials=new Set;this.plugins=e.plugins,this.features=e.features,this.marked=new Set(e.markedRefs);}markRef(e){this.marked.add(e);}isMarked(e){return this.marked.has(e)}getSpecialReference(e){let r=this.getRefParam("_"+e);return this.specials.has(e)?r:(this.specials.add(e),r+"="+fr[e])}pushObjectFlag(e,r){e!==0&&(this.markRef(r),this.flags.push({type:e,value:this.getRefParam(r)}));}resolveFlags(){let e="";for(let r=0,t=this.flags,n=t.length;r<n;r++){let s=t[r];e+=cr[s.type]+"("+s.value+"),";}return e}resolvePatches(){let e=_e(this.assignments),r=this.resolveFlags();return e?r?e+r:e:r}createAssignment(e,r){this.assignments.push({t:"index",s:e,k:void 0,v:r});}createAddAssignment(e,r){this.assignments.push({t:"add",s:this.getRefParam(e),k:void 0,v:r});}createSetAssignment(e,r,t){this.assignments.push({t:"set",s:this.getRefParam(e),k:r,v:t});}createDeleteAssignment(e,r){this.assignments.push({t:"delete",s:this.getRefParam(e),k:r,v:void 0});}createArrayAssign(e,r,t){this.createAssignment(this.getRefParam(e)+"["+r+"]",t);}createObjectAssign(e,r,t){this.createAssignment(this.getRefParam(e)+"."+r,t);}isIndexedValueInStack(e){return e.t===4&&this.stack.includes(e.i)}serializeReference(e){return this.assignIndexedValue(e.i,x+'.get("'+e.s+'")')}getIterableAccess(){return this.features&2?".values()":"["+qe+"]()"}serializeIterable(e){let r="["+qe+"]",t=this.stack;this.stack=[];let n=this.serialize(e)+this.getIterableAccess();return this.stack=t,this.features&4?n=":()=>"+n:this.features&64?n="(){return "+n+"}":n=":function(){return "+n+"}",r+n}serializeArrayItem(e,r,t){return r?this.isIndexedValueInStack(r)?(this.markRef(e),this.createArrayAssign(e,t,this.getRefParam(r.i)),""):this.serialize(r):""}serializeArray(e){let r=e.i;if(e.l){this.stack.push(r);let t=e.a,n=this.serializeArrayItem(r,t[0],0),s=n==="";for(let i=1,o=e.l,d;i<o;i++)d=this.serializeArrayItem(r,t[i],i),n+=","+d,s=d==="";return this.stack.pop(),this.pushObjectFlag(e.o,e.i),this.assignIndexedValue(r,"["+n+(s?",]":"]"))}return this.assignIndexedValue(r,"[]")}serializeProperty(e,r,t){switch(r){case 0:return this.serializeIterable(t);default:{let n=Number(r),s=n>=0||xe(r);if(this.isIndexedValueInStack(t)){let i=this.getRefParam(t.i);return this.markRef(e),s&&n!==n?this.createObjectAssign(e,r,i):this.createArrayAssign(e,s?r:'"'+r+'"',i),""}return (s?r:'"'+r+'"')+":"+this.serialize(t)}}}serializeProperties(e,r){let t=r.s;if(t){this.stack.push(e);let n=r.k,s=r.v,i=this.serializeProperty(e,n[0],s[0]);for(let o=1,d=i;o<t;o++)d=this.serializeProperty(e,n[o],s[o]),i+=(d&&i&&",")+d;return this.stack.pop(),"{"+i+"}"}return "{}"}serializeObject(e){return this.pushObjectFlag(e.o,e.i),this.assignIndexedValue(e.i,this.serializeProperties(e.i,e.p))}serializeWithObjectAssign(e,r,t){let n=this.serializeProperties(r,e);return n!=="{}"?"Object.assign("+t+","+n+")":t}serializeAssignment(e,r,t,n){switch(t){case 0:{let s=this.stack;this.stack=[];let i=this.serialize(n)+this.getIterableAccess();this.stack=s;let o=this.assignments;this.assignments=r,this.createArrayAssign(e,this.getSpecialReference(0),this.features&4?"()=>"+i:"function(){return "+i+"}"),this.assignments=o;}break;default:{let s=this.serialize(n),i=Number(t),o=i>=0||xe(t);if(this.isIndexedValueInStack(n))o&&i!==i?this.createObjectAssign(e,t,s):this.createArrayAssign(e,o?t:'"'+t+'"',s);else {let d=this.assignments;this.assignments=r,o?this.createObjectAssign(e,t,s):this.createArrayAssign(e,o?t:'"'+t+'"',s),this.assignments=d;}}}}serializeAssignments(e,r){let t=r.s;if(t){this.stack.push(e);let n=[],s=r.k,i=r.v;for(let o=0;o<t;o++)this.serializeAssignment(e,n,s[o],i[o]);return this.stack.pop(),_e(n)}}serializeDictionary(e,r,t){if(r)if(this.features&128)t=this.serializeWithObjectAssign(r,e,t);else {this.markRef(e);let n=this.serializeAssignments(e,r);if(n)return "("+this.assignIndexedValue(e,t)+","+n+this.getRefParam(e)+")"}return this.assignIndexedValue(e,t)}serializeNullConstructor(e){return this.pushObjectFlag(e.o,e.i),this.serializeDictionary(e.i,e.p,ir)}serializeDate(e){return this.assignIndexedValue(e.i,'new Date("'+e.s+'")')}serializeRegExp(e){return this.assignIndexedValue(e.i,"/"+e.c+"/"+e.m)}serializeSetItem(e,r){return this.isIndexedValueInStack(r)?(this.markRef(e),this.createAddAssignment(e,this.getRefParam(r.i)),""):this.serialize(r)}serializeSet(e){let r=or,t=e.l,n=e.i;if(t){let s=e.a;this.stack.push(n);let i=this.serializeSetItem(n,s[0]);for(let o=1,d=i;o<t;o++)d=this.serializeSetItem(n,s[o]),i+=(d&&i&&",")+d;this.stack.pop(),i&&(r+="(["+i+"])");}return this.assignIndexedValue(n,r)}serializeMapEntry(e,r,t){if(this.isIndexedValueInStack(r)){let n=this.getRefParam(r.i);if(this.markRef(e),this.isIndexedValueInStack(t)){let i=this.getRefParam(t.i);return this.createSetAssignment(e,n,i),""}if(t.t!==4&&t.i!=null&&this.isMarked(t.i)){let i="("+this.serialize(t)+",["+this.getSpecialReference(0)+","+this.getSpecialReference(0)+"])";return this.createSetAssignment(e,n,this.getRefParam(t.i)),this.createDeleteAssignment(e,this.getSpecialReference(0)),i}let s=this.stack;return this.stack=[],this.createSetAssignment(e,n,this.serialize(t)),this.stack=s,""}if(this.isIndexedValueInStack(t)){let n=this.getRefParam(t.i);if(this.markRef(e),r.t!==4&&r.i!=null&&this.isMarked(r.i)){let i="("+this.serialize(r)+",["+this.getSpecialReference(0)+","+this.getSpecialReference(0)+"])";return this.createSetAssignment(e,this.getRefParam(r.i),n),this.createDeleteAssignment(e,this.getSpecialReference(0)),i}let s=this.stack;return this.stack=[],this.createSetAssignment(e,this.serialize(r),n),this.stack=s,""}return "["+this.serialize(r)+","+this.serialize(t)+"]"}serializeMap(e){let r=dr,t=e.e.s,n=e.i;if(t){let s=e.e.k,i=e.e.v;this.stack.push(n);let o=this.serializeMapEntry(n,s[0],i[0]);for(let d=1,c=o;d<t;d++)c=this.serializeMapEntry(n,s[d],i[d]),o+=(c&&o&&",")+c;this.stack.pop(),o&&(r+="(["+o+"])");}return this.assignIndexedValue(n,r)}serializeArrayBuffer(e){let r="new Uint8Array(",t=e.s,n=t.length;if(n){r+="["+t[0];for(let s=1;s<n;s++)r+=","+t[s];r+="]";}return this.assignIndexedValue(e.i,r+").buffer")}serializeTypedArray(e){return this.assignIndexedValue(e.i,"new "+e.c+"("+this.serialize(e.f)+","+e.b+","+e.l+")")}serializeDataView(e){return this.assignIndexedValue(e.i,"new DataView("+this.serialize(e.f)+","+e.b+","+e.l+")")}serializeAggregateError(e){let r=e.i;this.stack.push(r);let t='new AggregateError([],"'+e.m+'")';return this.stack.pop(),this.serializeDictionary(r,e.p,t)}serializeError(e){return this.serializeDictionary(e.i,e.p,"new "+Z[e.s]+'("'+e.m+'")')}serializePromise(e){let r,t=e.f,n=e.i,s=e.s?lr:ur;if(this.isIndexedValueInStack(t)){let i=this.getRefParam(t.i);this.features&4?e.s?r=s+"().then(()=>"+i+")":r=s+"().catch(()=>{throw "+i+"})":e.s?r=s+"().then(function(){return "+i+"})":r=s+"().catch(function(){throw "+i+"})";}else {this.stack.push(n);let i=this.serialize(t);this.stack.pop(),r=s+"("+i+")";}return this.assignIndexedValue(n,r)}serializeWKSymbol(e){return this.assignIndexedValue(e.i,we[e.s])}serializeURL(e){return this.assignIndexedValue(e.i,'new URL("'+e.s+'")')}serializeURLSearchParams(e){return this.assignIndexedValue(e.i,e.s?'new URLSearchParams("'+e.s+'")':"new URLSearchParams")}serializeBlob(e){return this.assignIndexedValue(e.i,"new Blob(["+this.serialize(e.f)+'],{type:"'+e.c+'"})')}serializeFile(e){return this.assignIndexedValue(e.i,"new File(["+this.serialize(e.f)+'],"'+e.m+'",{type:"'+e.c+'",lastModified:'+e.b+"})")}serializeHeaders(e){return this.assignIndexedValue(e.i,"new Headers("+this.serializeProperties(e.i,e.e)+")")}serializeFormDataEntry(e,r,t){return this.getRefParam(e)+'.append("'+r+'",'+this.serialize(t)+")"}serializeFormDataEntries(e,r){let t=e.e.k,n=e.e.v,s=e.i,i=this.serializeFormDataEntry(s,t[0],n[0]);for(let o=1;o<r;o++)i+=","+this.serializeFormDataEntry(s,t[o],n[o]);return i}serializeFormData(e){let r=e.e.s,t=e.i;r&&this.markRef(t);let n=this.assignIndexedValue(t,"new FormData()");if(r){let s=this.serializeFormDataEntries(e,r);return "("+n+","+(s?s+",":"")+this.getRefParam(t)+")"}return n}serializeBoxed(e){return this.assignIndexedValue(e.i,"Object("+this.serialize(e.f)+")")}serializeRequest(e){return this.assignIndexedValue(e.i,'new Request("'+e.s+'",'+this.serialize(e.f)+")")}serializeResponse(e){return this.assignIndexedValue(e.i,"new Response("+this.serialize(e.a[0])+","+this.serialize(e.a[1])+")")}serializeEvent(e){return this.assignIndexedValue(e.i,'new Event("'+e.s+'",'+this.serialize(e.f)+")")}serializeCustomEvent(e){return this.assignIndexedValue(e.i,'new CustomEvent("'+e.s+'",'+this.serialize(e.f)+")")}serializeDOMException(e){return this.assignIndexedValue(e.i,'new DOMException("'+e.s+'","'+e.c+'")')}serializePlugin(e){let r=this.plugins;if(r)for(let t=0,n=r.length;t<n;t++){let s=r[t];if(s.tag===e.c)return s.serialize(e.s,this,{id:e.i})}throw new Error('Missing plugin for tag "'+e.c+'".')}serialize(e){switch(e.t){case 2:return Ie[e.s];case 0:return ""+e.s;case 1:return '"'+e.s+'"';case 3:return e.s+"n";case 4:return this.getRefParam(e.i);case 20:return this.serializeReference(e);case 9:return this.serializeArray(e);case 10:return this.serializeObject(e);case 11:return this.serializeNullConstructor(e);case 5:return this.serializeDate(e);case 6:return this.serializeRegExp(e);case 7:return this.serializeSet(e);case 8:return this.serializeMap(e);case 21:return this.serializeArrayBuffer(e);case 16:case 15:return this.serializeTypedArray(e);case 22:return this.serializeDataView(e);case 14:return this.serializeAggregateError(e);case 13:return this.serializeError(e);case 12:return this.serializePromise(e);case 17:return this.serializeWKSymbol(e);case 18:return this.serializeURL(e);case 19:return this.serializeURLSearchParams(e);case 23:return this.serializeBlob(e);case 24:return this.serializeFile(e);case 25:return this.serializeHeaders(e);case 26:return this.serializeFormData(e);case 27:return this.serializeBoxed(e);case 28:return this.serializePromiseConstructor(e);case 29:return this.serializePromiseResolve(e);case 30:return this.serializePromiseReject(e);case 31:return this.serializeReadableStreamConstructor(e);case 32:return this.serializeReadableStreamEnqueue(e);case 34:return this.serializeReadableStreamError(e);case 33:return this.serializeReadableStreamClose(e);case 35:return this.serializeRequest(e);case 36:return this.serializeResponse(e);case 37:return this.serializeEvent(e);case 38:return this.serializeCustomEvent(e);case 39:return this.serializeDOMException(e);case 40:return this.serializePlugin(e);default:throw new Error("invariant")}}};var y=class extends V{parseItems(e){let r=e.length,t=[],n=[];for(let s=0,i;s<r;s++)s in e&&(i=e[s],this.isIterable(i)?n[s]=i:t[s]=this.parse(i));for(let s=0;s<r;s++)s in n&&(t[s]=this.parse(n[s]));return t}parseArray(e,r){return {t:9,i:e,s:void 0,l:r.length,c:void 0,m:void 0,p:void 0,e:void 0,a:this.parseItems(r),f:void 0,b:void 0,o:L(r)}}parseProperties(e){let r=Object.entries(e),t=[],n=[],s=[],i=[];for(let o=0,d=r.length,c,g;o<d;o++)c=l(r[o][0]),g=r[o][1],this.isIterable(g)?(s.push(c),i.push(g)):(t.push(c),n.push(this.parse(g)));for(let o=0,d=s.length;o<d;o++)t.push(s[o]),n.push(this.parse(i[o]));return this.features&1024&&Symbol.iterator in e&&(t.push(0),n.push(this.parse(Array.from(e)))),{k:t,v:n,s:t.length}}parsePlainObject(e,r,t){return {t:t?11:10,i:e,s:void 0,l:void 0,c:void 0,m:void 0,p:this.parseProperties(r),e:void 0,a:void 0,f:void 0,b:void 0,o:L(r)}}parseBoxed(e,r){return {t:27,i:e,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(r.valueOf()),b:void 0,o:void 0}}parseTypedArray(e,r){return {t:15,i:e,s:void 0,l:r.length,c:r.constructor.name,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(r.buffer),b:r.byteOffset,o:void 0}}parseBigIntTypedArray(e,r){return {t:16,i:e,s:void 0,l:r.length,c:r.constructor.name,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(r.buffer),b:r.byteOffset,o:void 0}}parseDataView(e,r){return {t:22,i:e,s:void 0,l:r.byteLength,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(r.buffer),b:r.byteOffset,o:void 0}}parseError(e,r){let t=F(r,this.features),n=t?this.parseProperties(t):void 0;return {t:13,i:e,s:K(r),l:void 0,c:void 0,m:l(r.message),p:n,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}parseMap(e,r){let t=[],n=[],s=[],i=[];for(let[o,d]of r.entries())this.isIterable(o)||this.isIterable(d)?(s.push(o),i.push(d)):(t.push(this.parse(o)),n.push(this.parse(d)));for(let o=0,d=s.length;o<d;o++)t.push(this.parse(s[o])),n.push(this.parse(i[o]));return {t:8,i:e,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:{k:t,v:n,s:r.size},a:void 0,f:void 0,b:void 0,o:void 0}}parseSet(e,r){let t=[],n=[];for(let s of r.keys())this.isIterable(s)?n.push(s):t.push(this.parse(s));for(let s=0,i=n.length;s<i;s++)t.push(this.parse(n[s]));return {t:7,i:e,s:void 0,l:r.size,c:void 0,m:void 0,p:void 0,e:void 0,a:t,f:void 0,b:void 0,o:void 0}}parsePlainProperties(e){let r=e.length,t=[],n=[],s=[],i=[];for(let o=0,d,c;o<r;o++)d=l(e[o][0]),c=e[o][1],this.isIterable(c)?(s.push(d),i.push(c)):(t.push(d),n.push(this.parse(c)));for(let o=0,d=s.length;o<d;o++)t.push(s[o]),n.push(this.parse(i[o]));return {k:t,v:n,s:r}}parseHeaders(e,r){let t=[];return r.forEach((n,s)=>{t.push([s,n]);}),{t:25,i:e,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:this.parsePlainProperties(t),a:void 0,f:void 0,b:void 0,o:void 0}}parseFormData(e,r){let t=[];return r.forEach((n,s)=>{t.push([s,n]);}),{t:26,i:e,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:this.parsePlainProperties(t),a:void 0,f:void 0,b:void 0,o:void 0}}parseEvent(e,r){return {t:37,i:e,s:l(r.type),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(le(r)),b:void 0,o:void 0}}parseCustomEvent(e,r){return {t:38,i:e,s:l(r.type),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:this.parse(ue(r)),b:void 0,o:void 0}}parseAggregateError(e,r){let t=F(r,this.features),n=t?this.parseProperties(t):void 0;return {t:14,i:e,s:void 0,l:void 0,c:void 0,m:l(r.message),p:n,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}parsePlugin(e,r){let t=this.plugins;if(t)for(let n=0,s=t.length;n<s;n++){let i=t[n];if(i.parse.sync&&i.test(r))return D(e,i.tag,i.parse.sync(r,this,{id:e}))}}parseObject(e,r){if(Array.isArray(r))return this.parseArray(e,r);let t=r.constructor;switch(t){case Object:return this.parsePlainObject(e,r,!1);case void 0:return this.parsePlainObject(e,r,!0);case Date:return z(e,r);case RegExp:return T(e,r);case Error:case EvalError:case RangeError:case ReferenceError:case SyntaxError:case TypeError:case URIError:return this.parseError(e,r);case Number:case Boolean:case String:case BigInt:return this.parseBoxed(e,r);}let n=this.features;if(n&2048)switch(t){case ArrayBuffer:return B(e,r);case Int8Array:case Int16Array:case Int32Array:case Uint8Array:case Uint16Array:case Uint32Array:case Uint8ClampedArray:case Float32Array:case Float64Array:return this.parseTypedArray(e,r);case DataView:return this.parseDataView(e,r);}if((n&4104)===4104)switch(t){case BigInt64Array:case BigUint64Array:return this.parseBigIntTypedArray(e,r);}if(n&32&&t===Map)return this.parseMap(e,r);if(n&512&&t===Set)return this.parseSet(e,r);if(n&8192)switch(t){case(typeof URL!="undefined"?URL:u):return U(e,r);case(typeof URLSearchParams!="undefined"?URLSearchParams:u):return M(e,r);case(typeof Headers!="undefined"?Headers:u):return this.parseHeaders(e,r);case(typeof FormData!="undefined"?FormData:u):return this.parseFormData(e,r);case(typeof Event!="undefined"?Event:u):return this.parseEvent(e,r);case(typeof CustomEvent!="undefined"?CustomEvent:u):return this.parseCustomEvent(e,r);case(typeof DOMException!="undefined"?DOMException:u):return j(e,r);}let s=this.parsePlugin(e,r);if(s)return s;if(n&1&&typeof AggregateError!="undefined"&&(t===AggregateError||r instanceof AggregateError))return this.parseAggregateError(e,r);if(r instanceof Error)return this.parseError(e,r);if(n&1024&&Symbol.iterator in r)return this.parsePlainObject(e,r,!!t);throw new m(r)}parse(e){switch(e){case!0:return Q;case!1:return ee;case void 0:return re;case null:return E;}switch(typeof e){case"string":return se(e);case"number":return ne(e);case"bigint":return S(this.features&8,new m(e)),ae(e);case"object":{let r=this.getReference(e);return typeof r=="number"?this.parseObject(r,e):r}case"symbol":{S(this.features&1024,new m(e));let r=this.getReference(e);return typeof r=="number"?ie(r,e):r}case"function":return S(P(e),new Error("Cannot serialize function without reference ID.")),this.getStrictReference(e);default:throw new m(e)}}};var C=class extends O{constructor(r){super(r);this.mode="cross";this.scopeId=r.scopeId;}getRefParam(r){return typeof r=="string"?k+"."+r:k+"["+r+"]"}assignIndexedValue(r,t){return this.getRefParam(r)+"="+t}serializePromiseConstructor(r){return this.assignIndexedValue(r.i,b+"."+ge+"()")}serializePromiseResolve(r){return b+"."+he+"("+this.getRefParam(r.i)+","+this.serialize(r.f)+")"}serializePromiseReject(r){return b+"."+ve+"("+this.getRefParam(r.i)+","+this.serialize(r.f)+")"}serializeReadableStreamConstructor(r){return this.assignIndexedValue(r.i,b+"."+be+"()")}serializeReadableStreamEnqueue(r){return b+"."+H+"("+this.getRefParam(r.i)+",0,"+this.serialize(r.f)+")"}serializeReadableStreamError(r){return b+"."+H+"("+this.getRefParam(r.i)+",1,"+this.serialize(r.f)+")"}serializeReadableStreamClose(r){return b+"."+H+"("+this.getRefParam(r.i)+",2)"}serializeTop(r){let t=this.serialize(r),n=r.i;if(n==null)return t;let s=this.resolvePatches(),i=this.getRefParam(n),o=this.scopeId==null?"":k,d=s?t+","+s:t;if(o==="")return s?"("+d+i+")":d;let c=this.scopeId==null?"()":"("+k+'["'+l(this.scopeId)+'"])',g=d+(s?i:"");return this.features&4?"("+o+"=>("+g+"))"+c:"(function("+o+"){return "+g+"})"+c}};var X=class extends y{constructor(r){super(r);this.alive=!0;this.pending=0;this.onParseCallback=r.onParse,this.onErrorCallback=r.onError,this.onDoneCallback=r.onDone;}onParse(r,t){this.onParseCallback(r,t);}onError(r){if(this.onErrorCallback)this.onErrorCallback(r);else throw r}onDone(){this.onDoneCallback&&this.onDoneCallback();}push(r){this.onParse(this.parse(r),!1);}pushPendingState(){this.pending++;}popPendingState(){--this.pending<=0&&this.onDone();}pushReadableStreamReader(r,t){t.read().then(n=>{if(this.alive)if(n.done)this.onParse({t:33,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0},!1),this.popPendingState();else {let s=this.parseWithError(n.value);s&&(this.onParse({t:32,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:s,b:void 0,o:void 0},!1),this.pushReadableStreamReader(r,t));}},n=>{if(this.alive){let s=this.parseWithError(n);s&&(this.onParse({t:34,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:s,b:void 0,o:void 0},!1),this.popPendingState());}});}parseReadableStream(r,t){let n=t.getReader();return this.pushPendingState(),this.pushReadableStreamReader(r,n),{t:31,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}parseRequest(r,t){return {t:35,i:r,s:l(t.url),l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,f:this.parse(oe(t,t.clone().body)),a:void 0,b:void 0,o:void 0}}parseResponse(r,t){return {t:36,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,f:void 0,a:[t.body?this.parse(t.clone().body):E,this.parse(de(t))],b:void 0,o:void 0}}parsePromise(r,t){return t.then(n=>{let s=this.parseWithError(n);s&&(this.onParse({t:29,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:s,b:void 0,o:void 0},!1),this.popPendingState());},n=>{if(this.alive){let s=this.parseWithError(n);s&&(this.onParse({t:30,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:s,b:void 0,o:void 0},!1),this.popPendingState());}}),this.pushPendingState(),{t:28,i:r,s:void 0,l:void 0,c:void 0,m:void 0,p:void 0,e:void 0,a:void 0,f:void 0,b:void 0,o:void 0}}parsePlugin(r,t){let n=this.plugins;if(n)for(let s=0,i=n.length;s<i;s++){let o=n[s];if(o.parse.stream&&o.test(t))return D(r,o.tag,o.parse.stream(t,this,{id:r}))}}parseObject(r,t){if(Array.isArray(t))return this.parseArray(r,t);let n=t.constructor;switch(n){case Object:return this.parsePlainObject(r,t,!1);case void 0:return this.parsePlainObject(r,t,!0);case Date:return z(r,t);case RegExp:return T(r,t);case Error:case EvalError:case RangeError:case ReferenceError:case SyntaxError:case TypeError:case URIError:return this.parseError(r,t);case Number:case Boolean:case String:case BigInt:return this.parseBoxed(r,t);}let s=this.features;if(s&256&&(n===Promise||t instanceof Promise))return this.parsePromise(r,t);if(s&2048)switch(n){case ArrayBuffer:return B(r,t);case Int8Array:case Int16Array:case Int32Array:case Uint8Array:case Uint16Array:case Uint32Array:case Uint8ClampedArray:case Float32Array:case Float64Array:return this.parseTypedArray(r,t);case DataView:return this.parseDataView(r,t);}if((s&4104)===4104)switch(n){case BigInt64Array:case BigUint64Array:return this.parseBigIntTypedArray(r,t);}if(s&32&&n===Map)return this.parseMap(r,t);if(s&512&&n===Set)return this.parseSet(r,t);if(s&8192)switch(n){case(typeof URL!="undefined"?URL:u):return U(r,t);case(typeof URLSearchParams!="undefined"?URLSearchParams:u):return M(r,t);case(typeof Headers!="undefined"?Headers:u):return this.parseHeaders(r,t);case(typeof FormData!="undefined"?FormData:u):return this.parseFormData(r,t);case(typeof ReadableStream!="undefined"?ReadableStream:u):return this.parseReadableStream(r,t);case(typeof Request!="undefined"?Request:u):return this.parseRequest(r,t);case(typeof Response!="undefined"?Response:u):return this.parseResponse(r,t);case(typeof Event!="undefined"?Event:u):return this.parseEvent(r,t);case(typeof CustomEvent!="undefined"?CustomEvent:u):return this.parseCustomEvent(r,t);case(typeof DOMException!="undefined"?DOMException:u):return j(r,t);}let i=this.parsePlugin(r,t);if(i)return i;if(s&1&&typeof AggregateError!="undefined"&&(n===AggregateError||t instanceof AggregateError))return this.parseAggregateError(r,t);if(t instanceof Error)return this.parseError(r,t);if(s&1024&&Symbol.iterator in t)return this.parsePlainObject(r,t,!!n);throw new m(t)}parseWithError(r){try{return this.parse(r)}catch(t){this.onError(t);return}}start(r){let t=this.parseWithError(r);t&&(this.onParse(t,!0),this.pending<=0&&this.destroy());}destroy(){this.alive&&(this.onDone(),this.alive=!1);}isAlive(){return this.alive}};var Y=class extends X{constructor(){super(...arguments);this.mode="cross";}};function Xe(a,e){let r=new Y({refs:e.refs,disabledFeatures:e.disabledFeatures,onParse(t,n){let s=new C({plugins:e.plugins,features:r.features,scopeId:e.scopeId,markedRefs:r.marked}),i;try{i=s.serializeTop(t);}catch(o){e.onError&&e.onError(o);return}e.onSerialize(i,n);},onError:e.onError,onDone:e.onDone});return r.start(a),()=>{r.destroy();}}var fe=class{constructor(e){this.options=e;this.alive=!0;this.flushed=!1;this.done=!1;this.pending=0;this.cleanups=[];this.refs=new Map;this.keys=new Set;this.ids=0;}write(e,r){this.alive&&!this.flushed&&(this.pending++,this.keys.add(e),this.cleanups.push(Xe(r,{plugins:this.options.plugins,scopeId:this.options.scopeId,refs:this.refs,disabledFeatures:this.options.disabledFeatures,onError:this.options.onError,onSerialize:(t,n)=>{this.alive&&this.options.onData(n?this.options.globalIdentifier+'["'+l(e)+'"]='+t:t);},onDone:()=>{this.alive&&(this.pending--,this.pending<=0&&this.flushed&&!this.done&&this.options.onDone&&(this.options.onDone(),this.done=!0));}})));}getNextID(){for(;this.keys.has(""+this.ids);)this.ids++;return ""+this.ids}push(e){let r=this.getNextID();return this.write(r,e),r}flush(){this.alive&&(this.flushed=!0,this.pending<=0&&!this.done&&this.options.onDone&&(this.options.onDone(),this.done=!0));}close(){if(this.alive){for(let e=0,r=this.cleanups.length;e<r;e++)this.cleanups[e]();!this.done&&this.options.onDone&&(this.options.onDone(),this.done=!0),this.alive=!1;}}};

const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
const BooleanAttributes = /*#__PURE__*/new Set(booleans);
const ChildProperties = /*#__PURE__*/new Set(["innerHTML", "textContent", "innerText", "children"]);
const Aliases = /*#__PURE__*/Object.assign(Object.create(null), {
  className: "class",
  htmlFor: "for"
});

const ES2017FLAG = v.AggregateError
| v.BigInt
| v.BigIntTypedArray;
const GLOBAL_IDENTIFIER = '_$HY.r';
function createSerializer({
  onData,
  onDone,
  scopeId,
  onError
}) {
  return new fe({
    scopeId,
    globalIdentifier: GLOBAL_IDENTIFIER,
    disabledFeatures: ES2017FLAG,
    onData,
    onDone,
    onError
  });
}
function getGlobalHeaderScript() {
  return Ze;
}
function getLocalHeaderScript(id) {
  return Qe(id);
}

const VOID_ELEMENTS = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
const REPLACE_SCRIPT = `function $df(e,n,o,t){if(n=document.getElementById(e),o=document.getElementById("pl-"+e)){for(;o&&8!==o.nodeType&&o.nodeValue!=="pl-"+e;)t=o.nextSibling,o.remove(),o=t;_$HY.done?o.remove():o.replaceWith(n.content)}n.remove(),_$HY.fe(e)}`;
function renderToStringAsync(code, options = {}) {
  const {
    timeoutMs = 30000
  } = options;
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject("renderToString timed out"), timeoutMs);
  });
  return Promise.race([renderToStream(code, options), timeout]).then(html => {
    clearTimeout(timeoutHandle);
    return html;
  });
}
function renderToStream(code, options = {}) {
  let {
    nonce,
    onCompleteShell,
    onCompleteAll,
    renderId,
    noScripts
  } = options;
  let dispose;
  const blockingPromises = [];
  const pushTask = task => {
    if (noScripts) return;
    if (!tasks && !firstFlushed) {
      tasks = getLocalHeaderScript(renderId);
    }
    tasks += task + ";";
    if (!timer && firstFlushed) {
      timer = setTimeout(writeTasks);
    }
  };
  const checkEnd = () => {
    if (!registry.size && !completed) {
      writeTasks();
      onCompleteAll && onCompleteAll({
        write(v) {
          !completed && buffer.write(v);
        }
      });
      writable && writable.end();
      completed = true;
      setTimeout(dispose);
    }
  };
  const serializer = createSerializer({
    scopeId: options.renderId,
    onData: pushTask,
    onDone: checkEnd,
    onError: options.onError
  });
  const flushEnd = () => {
    if (!registry.size) {
      serializer.flush();
    }
  };
  const registry = new Map();
  const writeTasks = () => {
    if (tasks.length && !completed && firstFlushed) {
      buffer.write(`<script${nonce ? ` nonce="${nonce}"` : ""}>${tasks}</script>`);
      tasks = "";
    }
    timer && clearTimeout(timer);
    timer = null;
  };
  let context;
  let writable;
  let tmp = "";
  let tasks = "";
  let firstFlushed = false;
  let completed = false;
  let scriptFlushed = false;
  let timer = null;
  let buffer = {
    write(payload) {
      tmp += payload;
    }
  };
  sharedConfig.context = context = {
    id: renderId || "",
    count: 0,
    async: true,
    resources: {},
    lazy: {},
    suspense: {},
    assets: [],
    nonce,
    block(p) {
      if (!firstFlushed) blockingPromises.push(p);
    },
    replace(id, payloadFn) {
      if (firstFlushed) return;
      const placeholder = `<!--!$${id}-->`;
      const first = html.indexOf(placeholder);
      if (first === -1) return;
      const last = html.indexOf(`<!--!$/${id}-->`, first + placeholder.length);
      html = html.replace(html.slice(first, last + placeholder.length + 1), resolveSSRNode(payloadFn()));
    },
    serialize(id, p, wait) {
      const serverOnly = sharedConfig.context.noHydrate;
      if (!firstFlushed && wait && typeof p === "object" && "then" in p) {
        blockingPromises.push(p);
        !serverOnly && p.then(d => {
          serializer.write(id, d);
        }).catch(e => {
          serializer.write(id, e);
        });
      } else if (!serverOnly) serializer.write(id, p);
    },
    registerFragment(key) {
      if (!registry.has(key)) {
        let resolve, reject;
        const p = new Promise((r, rej) => (resolve = r, reject = rej));
        registry.set(key, {
          resolve,
          reject
        });
        serializer.write(key, p);
      }
      return (value, error) => {
        if (registry.has(key)) {
          const {
            resolve,
            reject
          } = registry.get(key);
          registry.delete(key);
          if (waitForFragments(registry, key)) {
            resolve(true);
            return;
          }
          if ((value !== undefined || error) && !completed) {
            if (!firstFlushed) {
              Promise.resolve().then(() => html = replacePlaceholder(html, key, value !== undefined ? value : ""));
              error ? reject(error) : resolve(true);
            } else {
              buffer.write(`<template id="${key}">${value !== undefined ? value : " "}</template>`);
              pushTask(`$df("${key}")${!scriptFlushed ? ";" + REPLACE_SCRIPT : ""}`);
              error ? reject(error) : resolve(true);
              scriptFlushed = true;
            }
          }
        }
        if (!registry.size) Promise.resolve().then(flushEnd);
        return firstFlushed;
      };
    }
  };
  let html = createRoot(d => {
    dispose = d;
    return resolveSSRNode(escape(code()));
  });
  function doShell() {
    sharedConfig.context = context;
    context.noHydrate = true;
    html = injectAssets(context.assets, html);
    if (tasks.length) html = injectScripts(html, tasks, nonce);
    buffer.write(html);
    tasks = "";
    onCompleteShell && onCompleteShell({
      write(v) {
        !completed && buffer.write(v);
      }
    });
  }
  return {
    then(fn) {
      function complete() {
        doShell();
        fn(tmp);
      }
      if (onCompleteAll) {
        let ogComplete = onCompleteAll;
        onCompleteAll = options => {
          ogComplete(options);
          complete();
        };
      } else onCompleteAll = complete;
      if (!registry.size) Promise.resolve().then(flushEnd);
    },
    pipe(w) {
      Promise.allSettled(blockingPromises).then(() => {
        doShell();
        buffer = writable = w;
        buffer.write(tmp);
        firstFlushed = true;
        if (completed) writable.end();else setTimeout(flushEnd);
      });
    },
    pipeTo(w) {
      return Promise.allSettled(blockingPromises).then(() => {
        doShell();
        const encoder = new TextEncoder();
        const writer = w.getWriter();
        let resolve;
        const p = new Promise(r => resolve = r);
        writable = {
          end() {
            writer.releaseLock();
            w.close();
            resolve();
          }
        };
        buffer = {
          write(payload) {
            writer.write(encoder.encode(payload));
          }
        };
        buffer.write(tmp);
        firstFlushed = true;
        if (completed) writable.end();else setTimeout(flushEnd);
        return p;
      });
    }
  };
}
function HydrationScript(props) {
  const {
    nonce
  } = sharedConfig.context;
  return ssr(generateHydrationScript({
    nonce,
    ...props
  }));
}
function ssr(t, ...nodes) {
  if (nodes.length) {
    let result = "";
    for (let i = 0; i < nodes.length; i++) {
      result += t[i];
      const node = nodes[i];
      if (node !== undefined) result += resolveSSRNode(node);
    }
    t = result + t[nodes.length];
  }
  return {
    t
  };
}
function ssrClassList(value) {
  if (!value) return "";
  let classKeys = Object.keys(value),
    result = "";
  for (let i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i],
      classValue = !!value[key];
    if (!key || key === "undefined" || !classValue) continue;
    i && (result += " ");
    result += escape(key);
  }
  return result;
}
function ssrStyle(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  let result = "";
  const k = Object.keys(value);
  for (let i = 0; i < k.length; i++) {
    const s = k[i];
    const v = value[s];
    if (v != undefined) {
      if (i) result += ";";
      result += `${s}:${escape(v, true)}`;
    }
  }
  return result;
}
function ssrElement(tag, props, children, needsId) {
  if (props == null) props = {};else if (typeof props === "function") props = props();
  const skipChildren = VOID_ELEMENTS.test(tag);
  const keys = Object.keys(props);
  let result = `<${tag}${needsId ? ssrHydrationKey() : ""} `;
  let classResolved;
  for (let i = 0; i < keys.length; i++) {
    const prop = keys[i];
    if (ChildProperties.has(prop)) {
      if (children === undefined && !skipChildren) children = prop === "innerHTML" ? props[prop] : escape(props[prop]);
      continue;
    }
    const value = props[prop];
    if (prop === "style") {
      result += `style="${ssrStyle(value)}"`;
    } else if (prop === "class" || prop === "className" || prop === "classList") {
      if (classResolved) continue;
      let n;
      result += `class="${escape(((n = props.class) ? n + " " : "") + ((n = props.className) ? n + " " : ""), true) + ssrClassList(props.classList)}"`;
      classResolved = true;
    } else if (BooleanAttributes.has(prop)) {
      if (value) result += prop;else continue;
    } else if (value == undefined || prop === "ref" || prop.slice(0, 2) === "on") {
      continue;
    } else {
      result += `${Aliases[prop] || prop}="${escape(value, true)}"`;
    }
    if (i !== keys.length - 1) result += " ";
  }
  if (skipChildren) return {
    t: result + "/>"
  };
  if (typeof children === "function") children = children();
  return {
    t: result + `>${resolveSSRNode(children, true)}</${tag}>`
  };
}
function ssrAttribute(key, value, isBoolean) {
  return isBoolean ? value ? " " + key : "" : value != null ? ` ${key}="${value}"` : "";
}
function ssrHydrationKey() {
  const hk = getHydrationKey();
  return hk ? ` data-hk="${hk}"` : "";
}
function escape(s, attr) {
  const t = typeof s;
  if (t !== "string") {
    if (!attr && t === "function") return escape(s());
    if (!attr && Array.isArray(s)) {
      for (let i = 0; i < s.length; i++) s[i] = escape(s[i]);
      return s;
    }
    if (attr && t === "boolean") return String(s);
    return s;
  }
  const delim = attr ? '"' : "<";
  const escDelim = attr ? "&quot;" : "&lt;";
  let iDelim = s.indexOf(delim);
  let iAmp = s.indexOf("&");
  if (iDelim < 0 && iAmp < 0) return s;
  let left = 0,
    out = "";
  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) out += s.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = s.indexOf(delim, left);
    } else {
      if (left < iAmp) out += s.substring(left, iAmp);
      out += "&amp;";
      left = iAmp + 1;
      iAmp = s.indexOf("&", left);
    }
  }
  if (iDelim >= 0) {
    do {
      if (left < iDelim) out += s.substring(left, iDelim);
      out += escDelim;
      left = iDelim + 1;
      iDelim = s.indexOf(delim, left);
    } while (iDelim >= 0);
  } else while (iAmp >= 0) {
    if (left < iAmp) out += s.substring(left, iAmp);
    out += "&amp;";
    left = iAmp + 1;
    iAmp = s.indexOf("&", left);
  }
  return left < s.length ? out + s.substring(left) : out;
}
function resolveSSRNode(node, top) {
  const t = typeof node;
  if (t === "string") return node;
  if (node == null || t === "boolean") return "";
  if (Array.isArray(node)) {
    let prev = {};
    let mapped = "";
    for (let i = 0, len = node.length; i < len; i++) {
      if (!top && typeof prev !== "object" && typeof node[i] !== "object") mapped += `<!--!$-->`;
      mapped += resolveSSRNode(prev = node[i]);
    }
    return mapped;
  }
  if (t === "object") return node.t;
  if (t === "function") return resolveSSRNode(node());
  return String(node);
}
function getHydrationKey() {
  const hydrate = sharedConfig.context;
  return hydrate && !hydrate.noHydrate && `${hydrate.id}${hydrate.count++}`;
}
function useAssets(fn) {
  sharedConfig.context.assets.push(() => resolveSSRNode(fn()));
}
function generateHydrationScript({
  eventNames = ["click", "input"],
  nonce
} = {}) {
  return `<script${nonce ? ` nonce="${nonce}"` : ""}>window._$HY||(e=>{let t=e=>e&&e.hasAttribute&&(e.hasAttribute("data-hk")?e:t(e.host&&e.host.nodeType?e.host:e.parentNode));["${eventNames.join('", "')}"].forEach((o=>document.addEventListener(o,(o=>{let a=o.composedPath&&o.composedPath()[0]||o.target,s=t(a);s&&!e.completed.has(s)&&e.events.push([s,o])}))))})(_$HY={events:[],completed:new WeakSet,r:{},fe(){}});${getGlobalHeaderScript()}</script><!--xs-->`;
}
function NoHydration(props) {
  sharedConfig.context.noHydrate = true;
  return props.children;
}
function injectAssets(assets, html) {
  if (!assets || !assets.length) return html;
  let out = "";
  for (let i = 0, len = assets.length; i < len; i++) out += assets[i]();
  return html.replace(`</head>`, out + `</head>`);
}
function injectScripts(html, scripts, nonce) {
  const tag = `<script${nonce ? ` nonce="${nonce}"` : ""}>${scripts}</script>`;
  const index = html.indexOf("<!--xs-->");
  if (index > -1) {
    return html.slice(0, index) + tag + html.slice(index);
  }
  return html + tag;
}
function waitForFragments(registry, key) {
  for (const k of [...registry.keys()].reverse()) {
    if (key.startsWith(k)) return true;
  }
  return false;
}
function replacePlaceholder(html, key, value) {
  const marker = `<template id="pl-${key}">`;
  const close = `<!--pl-${key}-->`;
  const first = html.indexOf(marker);
  if (first === -1) return html;
  const last = html.indexOf(close, first + marker.length);
  return html.slice(0, first) + value + html.slice(last + close.length);
}
const RequestContext = Symbol();
function getRequestEvent() {
  return globalThis[RequestContext] ? globalThis[RequestContext].getStore() : undefined;
}

const MetaContext = createContext();
const cascadingTags = ["title", "meta"];
// https://html.spec.whatwg.org/multipage/semantics.html#the-title-element
const titleTagProperties = [];
const metaTagProperties =
// https://html.spec.whatwg.org/multipage/semantics.html#the-meta-element
["name", "http-equiv", "content", "charset", "media"]
// additional properties
.concat(["property"]);
const getTagKey = (tag, properties) => {
  // pick allowed properties and sort them
  const tagProps = Object.fromEntries(Object.entries(tag.props).filter(([k]) => properties.includes(k)).sort());
  // treat `property` as `name` for meta tags
  if (Object.hasOwn(tagProps, "name") || Object.hasOwn(tagProps, "property")) {
    tagProps.name = tagProps.name || tagProps.property;
    delete tagProps.property;
  }
  // concat tag name and properties as unique key for this tag
  return tag.tag + JSON.stringify(tagProps);
};
function initServerProvider() {
  const tags = [];
  useAssets(() => ssr(renderTags(tags)));
  return {
    addTag(tagDesc) {
      // tweak only cascading tags
      if (cascadingTags.indexOf(tagDesc.tag) !== -1) {
        const properties = tagDesc.tag === "title" ? titleTagProperties : metaTagProperties;
        const tagDescKey = getTagKey(tagDesc, properties);
        const index = tags.findIndex(prev => prev.tag === tagDesc.tag && getTagKey(prev, properties) === tagDescKey);
        if (index !== -1) {
          tags.splice(index, 1);
        }
      }
      tags.push(tagDesc);
      return tags.length;
    },
    removeTag(tag, index) {}
  };
}
const MetaProvider = props => {
  let e;
  const actions = (e = getRequestEvent()) ? e.solidMeta || (e.solidMeta = initServerProvider()) : initServerProvider();
  return createComponent(MetaContext.Provider, {
    value: actions,
    get children() {
      return props.children;
    }
  });
};
const MetaTag = (tag, props, setting) => {
  useHead({
    tag,
    props,
    setting,
    id: createUniqueId(),
    get name() {
      return props.name || props.property;
    }
  });
  return null;
};
function useHead(tagDesc) {
  let c;
  {
    const event = getRequestEvent();
    c = event && event.solidMeta;
    // TODO: Consider if we want to support tags above MetaProvider
    // if (event) {
    //   c = event.solidMeta || (event.solidMeta = initServerProvider());
    // }
  }

  c = c || useContext(MetaContext);
  if (!c) throw new Error("<MetaProvider /> should be in the tree");
  createRenderEffect(() => {
    const index = c.addTag(tagDesc);
    onCleanup(() => c.removeTag(tagDesc, index));
  });
}
function renderTags(tags) {
  return tags.map(tag => {
    const keys = Object.keys(tag.props);
    const props = keys.map(k => k === "children" ? "" : ` ${k}="${
    // @ts-expect-error
    escape(tag.props[k], true)}"`).join("");
    const children = tag.props.children;
    if (tag.setting?.close) {
      return `<${tag.tag} data-sm="${tag.id}"${props}>${
      // @ts-expect-error
      tag.setting?.escape ? escape(children) : children || ""}</${tag.tag}>`;
    }
    return `<${tag.tag} data-sm="${tag.id}"${props}/>`;
  }).join("");
}
const Title = props => MetaTag("title", props, {
  escape: true,
  close: true
});
const Meta = props => MetaTag("meta", props);
function normalizeIntegration(integration) {
    if (!integration) {
        return {
            signal: createSignal({ value: "" })
        };
    }
    else if (Array.isArray(integration)) {
        return {
            signal: integration
        };
    }
    return integration;
}
function staticIntegration(obj) {
    return {
        signal: [() => obj, next => Object.assign(obj, next)]
    };
}

function createBeforeLeave() {
    let listeners = new Set();
    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    let ignore = false;
    function confirm(to, options) {
        if (ignore)
            return !(ignore = false);
        const e = {
            to,
            options,
            defaultPrevented: false,
            preventDefault: () => (e.defaultPrevented = true)
        };
        for (const l of listeners)
            l.listener({
                ...e,
                from: l.location,
                retry: (force) => {
                    force && (ignore = true);
                    l.navigate(to, options);
                }
            });
        return !e.defaultPrevented;
    }
    return {
        subscribe,
        confirm
    };
}

const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
function normalizePath(path, omitSlash = false) {
    const s = path.replace(trimPathRegex, "$1");
    return s ? (omitSlash || /^[?#]/.test(s) ? s : "/" + s) : "";
}
function resolvePath(base, path, from) {
    if (hasSchemeRegex.test(path)) {
        return undefined;
    }
    const basePath = normalizePath(base);
    const fromPath = from && normalizePath(from);
    let result = "";
    if (!fromPath || path.startsWith("/")) {
        result = basePath;
    }
    else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) {
        result = basePath + fromPath;
    }
    else {
        result = fromPath;
    }
    return (result || "/") + normalizePath(path, !result);
}
function invariant(value, message) {
    if (value == null) {
        throw new Error(message);
    }
    return value;
}
function joinPaths(from, to) {
    return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}
function extractSearchParams(url) {
    const params = {};
    url.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}
function createMatcher(path, partial, matchFilters) {
    const [pattern, splat] = path.split("/*", 2);
    const segments = pattern.split("/").filter(Boolean);
    const len = segments.length;
    return (location) => {
        const locSegments = location.split("/").filter(Boolean);
        const lenDiff = locSegments.length - len;
        if (lenDiff < 0 || (lenDiff > 0 && splat === undefined && !partial)) {
            return null;
        }
        const match = {
            path: len ? "" : "/",
            params: {}
        };
        const matchFilter = (s) => matchFilters === undefined ? undefined : matchFilters[s];
        for (let i = 0; i < len; i++) {
            const segment = segments[i];
            const locSegment = locSegments[i];
            const dynamic = segment[0] === ":";
            const key = dynamic ? segment.slice(1) : segment;
            if (dynamic && matchSegment(locSegment, matchFilter(key))) {
                match.params[key] = locSegment;
            }
            else if (dynamic || !matchSegment(locSegment, segment)) {
                return null;
            }
            match.path += `/${locSegment}`;
        }
        if (splat) {
            const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
            if (matchSegment(remainder, matchFilter(splat))) {
                match.params[splat] = remainder;
            }
            else {
                return null;
            }
        }
        return match;
    };
}
function matchSegment(input, filter) {
    const isEqual = (s) => s.localeCompare(input, undefined, { sensitivity: "base" }) === 0;
    if (filter === undefined) {
        return true;
    }
    else if (typeof filter === "string") {
        return isEqual(filter);
    }
    else if (typeof filter === "function") {
        return filter(input);
    }
    else if (Array.isArray(filter)) {
        return filter.some(isEqual);
    }
    else if (filter instanceof RegExp) {
        return filter.test(input);
    }
    return false;
}
function scoreRoute(route) {
    const [pattern, splat] = route.pattern.split("/*", 2);
    const segments = pattern.split("/").filter(Boolean);
    return segments.reduce((score, segment) => score + (segment.startsWith(":") ? 2 : 3), segments.length - (splat === undefined ? 0 : 1));
}
function createMemoObject(fn) {
    const map = new Map();
    const owner = getOwner();
    return new Proxy({}, {
        get(_, property) {
            if (!map.has(property)) {
                runWithOwner(owner, () => map.set(property, createMemo(() => fn()[property])));
            }
            return map.get(property)();
        },
        getOwnPropertyDescriptor() {
            return {
                enumerable: true,
                configurable: true
            };
        },
        ownKeys() {
            return Reflect.ownKeys(fn());
        }
    });
}
function expandOptionals$1(pattern) {
    let match = /(\/?\:[^\/]+)\?/.exec(pattern);
    if (!match)
        return [pattern];
    let prefix = pattern.slice(0, match.index);
    let suffix = pattern.slice(match.index + match[0].length);
    const prefixes = [prefix, (prefix += match[1])];
    // This section handles adjacent optional params. We don't actually want all permuations since
    // that will lead to equivalent routes which have the same number of params. For example
    // `/:a?/:b?/:c`? only has the unique expansion: `/`, `/:a`, `/:a/:b`, `/:a/:b/:c` and we can
    // discard `/:b`, `/:c`, `/:b/:c` by building them up in order and not recursing. This also helps
    // ensure predictability where earlier params have precidence.
    while ((match = /^(\/\:[^\/]+)\?/.exec(suffix))) {
        prefixes.push((prefix += match[1]));
        suffix = suffix.slice(match[0].length);
    }
    return expandOptionals$1(suffix).reduce((results, expansion) => [...results, ...prefixes.map(p => p + expansion)], []);
}

const MAX_REDIRECTS = 100;
const RouterContextObj = createContext();
const RouteContextObj = createContext();
const useRouter = () => invariant(useContext(RouterContextObj), "Make sure your app is wrapped in a <Router />");
let TempRoute;
const useRoute = () => TempRoute || useContext(RouteContextObj) || useRouter().base;
const useResolvedPath = (path) => {
    const route = useRoute();
    return createMemo(() => route.resolvePath(path()));
};
const useHref = (to) => {
    const router = useRouter();
    return createMemo(() => {
        const to_ = to();
        return to_ !== undefined ? router.renderPath(to_) : to_;
    });
};
const useLocation$1 = () => useRouter().location;
function createRoutes(routeDef, base = "", fallback) {
    const { component, data, children } = routeDef;
    const isLeaf = !children || (Array.isArray(children) && !children.length);
    const shared = {
        key: routeDef,
        element: component
            ? () => createComponent(component, {})
            : () => {
                const { element } = routeDef;
                return element === undefined && fallback
                    ? createComponent(fallback, {})
                    : element;
            },
        preload: routeDef.component
            ? component.preload
            : routeDef.preload,
        data
    };
    return asArray(routeDef.path).reduce((acc, path) => {
        for (const originalPath of expandOptionals$1(path)) {
            const path = joinPaths(base, originalPath);
            const pattern = isLeaf ? path : path.split("/*", 1)[0];
            acc.push({
                ...shared,
                originalPath,
                pattern,
                matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
            });
        }
        return acc;
    }, []);
}
function createBranch(routes, index = 0) {
    return {
        routes,
        score: scoreRoute(routes[routes.length - 1]) * 10000 - index,
        matcher(location) {
            const matches = [];
            for (let i = routes.length - 1; i >= 0; i--) {
                const route = routes[i];
                const match = route.matcher(location);
                if (!match) {
                    return null;
                }
                matches.unshift({
                    ...match,
                    route
                });
            }
            return matches;
        }
    };
}
function asArray(value) {
    return Array.isArray(value) ? value : [value];
}
function createBranches(routeDef, base = "", fallback, stack = [], branches = []) {
    const routeDefs = asArray(routeDef);
    for (let i = 0, len = routeDefs.length; i < len; i++) {
        const def = routeDefs[i];
        if (def && typeof def === "object" && def.hasOwnProperty("path")) {
            const routes = createRoutes(def, base, fallback);
            for (const route of routes) {
                stack.push(route);
                const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
                if (def.children && !isEmptyArray) {
                    createBranches(def.children, route.pattern, fallback, stack, branches);
                }
                else {
                    const branch = createBranch([...stack], branches.length);
                    branches.push(branch);
                }
                stack.pop();
            }
        }
    }
    // Stack will be empty on final return
    return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}
function getRouteMatches$1(branches, location) {
    for (let i = 0, len = branches.length; i < len; i++) {
        const match = branches[i].matcher(location);
        if (match) {
            return match;
        }
    }
    return [];
}
function createLocation(path, state) {
    const origin = new URL("http://sar");
    const url = createMemo(prev => {
        const path_ = path();
        try {
            return new URL(path_, origin);
        }
        catch (err) {
            console.error(`Invalid path ${path_}`);
            return prev;
        }
    }, origin);
    const pathname = createMemo(() => url().pathname);
    const search = createMemo(() => url().search, true);
    const hash = createMemo(() => url().hash);
    const key = createMemo(() => "");
    return {
        get pathname() {
            return pathname();
        },
        get search() {
            return search();
        },
        get hash() {
            return hash();
        },
        get state() {
            return state();
        },
        get key() {
            return key();
        },
        query: createMemoObject(on(search, () => extractSearchParams(url())))
    };
}
function createRouterContext(integration, base = "", data, out) {
    const { signal: [source, setSource], utils = {} } = normalizeIntegration(integration);
    const parsePath = utils.parsePath || (p => p);
    const renderPath = utils.renderPath || (p => p);
    const beforeLeave = utils.beforeLeave || createBeforeLeave();
    const basePath = resolvePath("", base);
    const output = out
        ? Object.assign(out, {
            matches: [],
            url: undefined
        })
        : undefined;
    if (basePath === undefined) {
        throw new Error(`${basePath} is not a valid base path`);
    }
    else if (basePath && !source().value) {
        setSource({ value: basePath, replace: true, scroll: false });
    }
    const [isRouting, setIsRouting] = createSignal(false);
    const start = async (callback) => {
        setIsRouting(true);
        try {
            await startTransition(callback);
        }
        finally {
            setIsRouting(false);
        }
    };
    const [reference, setReference] = createSignal(source().value);
    const [state, setState] = createSignal(source().state);
    const location = createLocation(reference, state);
    const referrers = [];
    const baseRoute = {
        pattern: basePath,
        params: {},
        path: () => basePath,
        outlet: () => null,
        resolvePath(to) {
            return resolvePath(basePath, to);
        }
    };
    if (data) {
        try {
            TempRoute = baseRoute;
            baseRoute.data = data({
                data: undefined,
                params: {},
                location,
                navigate: navigatorFactory(baseRoute)
            });
        }
        finally {
            TempRoute = undefined;
        }
    }
    function navigateFromRoute(route, to, options) {
        // Untrack in case someone navigates in an effect - don't want to track `reference` or route paths
        untrack(() => {
            if (typeof to === "number") {
                if (!to) ;
                else if (utils.go) {
                    beforeLeave.confirm(to, options) && utils.go(to);
                }
                else {
                    console.warn("Router integration does not support relative routing");
                }
                return;
            }
            const { replace, resolve, scroll, state: nextState } = {
                replace: false,
                resolve: true,
                scroll: true,
                ...options
            };
            const resolvedTo = resolve ? route.resolvePath(to) : resolvePath("", to);
            if (resolvedTo === undefined) {
                throw new Error(`Path '${to}' is not a routable path`);
            }
            else if (referrers.length >= MAX_REDIRECTS) {
                throw new Error("Too many redirects");
            }
            const current = reference();
            if (resolvedTo !== current || nextState !== state()) {
                {
                    if (output) {
                        output.url = resolvedTo;
                    }
                    setSource({ value: resolvedTo, replace, scroll, state: nextState });
                }
            }
        });
    }
    function navigatorFactory(route) {
        // Workaround for vite issue (https://github.com/vitejs/vite/issues/3803)
        route = route || useContext(RouteContextObj) || baseRoute;
        return (to, options) => navigateFromRoute(route, to, options);
    }
    createRenderEffect(() => {
        const { value, state } = source();
        // Untrack this whole block so `start` doesn't cause Solid's Listener to be preserved
        untrack(() => {
            if (value !== reference()) {
                start(() => {
                    setReference(value);
                    setState(state);
                });
            }
        });
    });
    return {
        base: baseRoute,
        out: output,
        location,
        isRouting,
        renderPath,
        parsePath,
        navigatorFactory,
        beforeLeave
    };
}
function createRouteContext(router, parent, child, match, params) {
    const { base, location, navigatorFactory } = router;
    const { pattern, element: outlet, preload, data } = match().route;
    const path = createMemo(() => match().path);
    preload && preload();
    const route = {
        parent,
        pattern,
        get child() {
            return child();
        },
        path,
        params,
        data: parent.data,
        outlet,
        resolvePath(to) {
            return resolvePath(base.path(), to, path());
        }
    };
    if (data) {
        try {
            TempRoute = route;
            route.data = data({ data: parent.data, params, location, navigate: navigatorFactory(route) });
        }
        finally {
            TempRoute = undefined;
        }
    }
    return route;
}

const Router = props => {
  const {
    source,
    url,
    base,
    data,
    out
  } = props;
  const integration = source || (staticIntegration({
    value: url || ""
  }) );
  const routerState = createRouterContext(integration, base, data, out);
  return createComponent(RouterContextObj.Provider, {
    value: routerState,
    get children() {
      return props.children;
    }
  });
};
const Routes$1 = props => {
  const router = useRouter();
  const parentRoute = useRoute();
  const routeDefs = children(() => props.children);
  const branches = createMemo(() => createBranches(routeDefs(), joinPaths(parentRoute.pattern, props.base || ""), Outlet));
  const matches = createMemo(() => getRouteMatches$1(branches(), router.location.pathname));
  const params = createMemoObject(() => {
    const m = matches();
    const params = {};
    for (let i = 0; i < m.length; i++) {
      Object.assign(params, m[i].params);
    }
    return params;
  });
  if (router.out) {
    router.out.matches.push(matches().map(({
      route,
      path,
      params
    }) => ({
      originalPath: route.originalPath,
      pattern: route.pattern,
      path,
      params
    })));
  }
  const disposers = [];
  let root;
  const routeStates = createMemo(on(matches, (nextMatches, prevMatches, prev) => {
    let equal = prevMatches && nextMatches.length === prevMatches.length;
    const next = [];
    for (let i = 0, len = nextMatches.length; i < len; i++) {
      const prevMatch = prevMatches && prevMatches[i];
      const nextMatch = nextMatches[i];
      if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) {
        next[i] = prev[i];
      } else {
        equal = false;
        if (disposers[i]) {
          disposers[i]();
        }
        createRoot(dispose => {
          disposers[i] = dispose;
          next[i] = createRouteContext(router, next[i - 1] || parentRoute, () => routeStates()[i + 1], () => matches()[i], params);
        });
      }
    }
    disposers.splice(nextMatches.length).forEach(dispose => dispose());
    if (prev && equal) {
      return prev;
    }
    root = next[0];
    return next;
  }));
  return createComponent(Show, {
    get when() {
      return routeStates() && root;
    },
    keyed: true,
    children: route => createComponent(RouteContextObj.Provider, {
      value: route,
      get children() {
        return route.outlet();
      }
    })
  });
};
const Outlet = () => {
  const route = useRoute();
  return createComponent(Show, {
    get when() {
      return route.child;
    },
    keyed: true,
    children: child => createComponent(RouteContextObj.Provider, {
      value: child,
      get children() {
        return child.outlet();
      }
    })
  });
};
function A$1(props) {
  props = mergeProps({
    inactiveClass: "inactive",
    activeClass: "active"
  }, props);
  const [, rest] = splitProps(props, ["href", "state", "class", "activeClass", "inactiveClass", "end"]);
  const to = useResolvedPath(() => props.href);
  const href = useHref(to);
  const location = useLocation$1();
  const isActive = createMemo(() => {
    const to_ = to();
    if (to_ === undefined) return false;
    const path = normalizePath(to_.split(/[?#]/, 1)[0]).toLowerCase();
    const loc = normalizePath(location.pathname).toLowerCase();
    return props.end ? path === loc : loc.startsWith(path);
  });
  return ssrElement("a", mergeProps({
    link: true
  }, rest, {
    get href() {
      return href() || props.href;
    },
    get state() {
      return JSON.stringify(props.state);
    },
    get classList() {
      return {
        ...(props.class && {
          [props.class]: true
        }),
        [props.inactiveClass]: !isActive(),
        [props.activeClass]: isActive(),
        ...rest.classList
      };
    },
    get ["aria-current"]() {
      return isActive() ? "page" : undefined;
    }
  }), undefined, true);
}

const useLocation = useLocation$1;

// @ts-expect-error
const routeLayouts = {
  "/*404": {
    "id": "/*404",
    "layouts": []
  },
  "/about": {
    "id": "/about",
    "layouts": []
  },
  "/": {
    "id": "/",
    "layouts": []
  }
};
var layouts = routeLayouts;

function flattenIslands(match, manifest, islands) {
  let result = [...match];
  match.forEach(m => {
    if (m.type !== "island") return;
    const islandManifest = manifest[m.href];
    if (islandManifest) {
      //&& (!islands || islands.has(m.href))
      const res = flattenIslands(islandManifest.assets, manifest);
      result.push(...res);
    }
  });
  return result;
}
function getAssetsFromManifest(event, matches) {
  let match = matches.reduce((memo, m) => {
    if (m.length) {
      const fullPath = m.reduce((previous, match) => previous + match.originalPath, "");
      const route = layouts[fullPath];
      if (route) {
        memo.push(...(event.env.manifest?.[route.id]?.assets || []));
        const layoutsManifestEntries = route.layouts.flatMap(manifestKey => event.env.manifest?.[manifestKey]?.assets || []);
        memo.push(...layoutsManifestEntries);
      }
    }
    return memo;
  }, []);
  match.push(...(event.env.manifest?.["entry-client"]?.assets || []));
  match = flattenIslands(match, event.env.manifest, event.$islands);
  return match;
}

const FETCH_EVENT = "$FETCH";

const ServerContext = /*#__PURE__*/createContext({
  $type: FETCH_EVENT
});
const useRequest = () => {
  return useContext(ServerContext);
};

const A = A$1;
const Routes = Routes$1;

const XSolidStartLocationHeader = "x-solidstart-location";
const LocationHeader = "Location";
const ContentTypeHeader = "content-type";
const XSolidStartResponseTypeHeader = "x-solidstart-response-type";
const XSolidStartContentTypeHeader = "x-solidstart-content-type";
const XSolidStartOrigin = "x-solidstart-origin";
const JSONResponseType = "application/json";
function redirect(url, init = 302) {
  let responseInit = init;
  if (typeof responseInit === "number") {
    responseInit = { status: responseInit };
  } else if (typeof responseInit.status === "undefined") {
    responseInit.status = 302;
  }
  if (url === "") {
    url = "/";
  }
  let headers = new Headers(responseInit.headers);
  headers.set(LocationHeader, url);
  const response = new Response(null, {
    ...responseInit,
    headers
  });
  return response;
}
const redirectStatusCodes = /* @__PURE__ */ new Set([204, 301, 302, 303, 307, 308]);
function isRedirectResponse(response) {
  return response && response instanceof Response && redirectStatusCodes.has(response.status);
}

class ServerError extends Error {
  constructor(message, {
    status,
    stack
  } = {}) {
    super(message);
    this.name = "ServerError";
    this.status = status || 400;
    if (stack) {
      this.stack = stack;
    }
  }
}
class FormError extends ServerError {
  constructor(message, {
    fieldErrors = {},
    form,
    fields,
    stack
  } = {}) {
    super(message, {
      stack
    });
    this.formError = message;
    this.name = "FormError";
    this.fields = fields || Object.fromEntries(typeof form !== "undefined" ? form.entries() : []) || {};
    this.fieldErrors = fieldErrors;
  }
}

const _tmpl$$6 = ["<div", " style=\"", "\"><div style=\"", "\"><p style=\"", "\" id=\"error-message\">", "</p><button id=\"reset-errors\" style=\"", "\">Clear errors and retry</button><pre style=\"", "\">", "</pre></div></div>"];
function ErrorBoundary(props) {
  return createComponent(ErrorBoundary$1, {
    fallback: (e, reset) => {
      return createComponent(Show, {
        get when() {
          return !props.fallback;
        },
        get fallback() {
          return props.fallback && props.fallback(e, reset);
        },
        get children() {
          return createComponent(ErrorMessage, {
            error: e
          });
        }
      });
    },
    get children() {
      return props.children;
    }
  });
}
function ErrorMessage(props) {
  console.log(props.error);
  return ssr(_tmpl$$6, ssrHydrationKey(), "padding:" + "16px", "background-color:" + "rgba(252, 165, 165)" + (";color:" + "rgb(153, 27, 27)") + (";border-radius:" + "5px") + (";overflow:" + "scroll") + (";padding:" + "16px") + (";margin-bottom:" + "8px"), "font-weight:" + "bold", escape(props.error.message), "color:" + "rgba(252, 165, 165)" + (";background-color:" + "rgb(153, 27, 27)") + (";border-radius:" + "5px") + (";padding:" + "4px 8px"), "margin-top:" + "8px" + (";width:" + "100%"), escape(props.error.stack));
}

const _tmpl$$5 = ["<link", " rel=\"stylesheet\"", ">"],
  _tmpl$2 = ["<link", " rel=\"modulepreload\"", ">"];

/**
 * Links are used to load assets for the server rendered HTML
 * @returns {JSXElement}
 */
function Links() {
  const context = useRequest();
  useAssets(() => {
    let match = getAssetsFromManifest(context, context.routerContext.matches);
    const links = match.reduce((r, src) => {
      let el = src.type === "style" ? ssr(_tmpl$$5, ssrHydrationKey(), ssrAttribute("href", escape(src.href, true), false)) : src.type === "script" ? ssr(_tmpl$2, ssrHydrationKey(), ssrAttribute("href", escape(src.href, true), false)) : undefined;
      if (el) r[src.href] = el;
      return r;
    }, {});
    return Object.values(links);
  });
  return null;
}

const _tmpl$3 = ["<script", " type=\"module\" async", "></script>"];
const isDev = "production" === "development";
const isIslands = false;
function IslandsScript() {
  return isIslands ;
}
function DevScripts() {
  return isDev ;
}
function ProdScripts() {
  const context = useRequest();
  return [createComponent(HydrationScript, {}), createComponent(NoHydration, {
    get children() {
      return [createComponent(IslandsScript, {}), (ssr(_tmpl$3, ssrHydrationKey(), ssrAttribute("src", escape(context.env.manifest?.["entry-client"].script.href, true), false)) )];
    }
  })];
}
function Scripts() {
  return [createComponent(DevScripts, {}), createComponent(ProdScripts, {})];
}

function Html(props) {
  {
    return ssrElement("html", props, undefined, false);
  }
}
function Head(props) {
  {
    return ssrElement("head", props, () => [escape(props.children), createComponent(Links, {})], false);
  }
}
function Body(props) {
  {
    return ssrElement("body", props, () => escape(props.children) , false);
  }
}

const _tmpl$$4 = ["<main", " class=\"text-center mx-auto text-gray-700 p-4\"><h1 class=\"max-6-xs text-6xl text-sky-700 font-thin uppercase my-16\">Not Found</h1><p class=\"mt-8\">Visit <a href=\"https://solidjs.com\" target=\"_blank\" class=\"text-sky-600 hover:underline\">solidjs.com</a> to learn how to build Solid apps.</p><p class=\"my-4\"><!--$-->", "<!--/--> - <!--$-->", "<!--/--></p></main>"];
function NotFound() {
  return ssr(_tmpl$$4, ssrHydrationKey(), escape(createComponent(A, {
    href: "/",
    "class": "text-sky-600 hover:underline",
    children: "Home"
  })), escape(createComponent(A, {
    href: "/about",
    "class": "text-sky-600 hover:underline",
    children: "About Page"
  })));
}

const _tmpl$$3 = ["<button", " class=\"w-[200px] rounded-full bg-gray-100 border-2 border-gray-300 focus:border-gray-400 active:border-gray-400 px-[2rem] py-[1rem]\">Clicks: <!--$-->", "<!--/--></button>"];
function Counter() {
  const [count, setCount] = createSignal(0);
  return ssr(_tmpl$$3, ssrHydrationKey(), escape(count()));
}

const _tmpl$$2 = ["<main", " class=\"text-center mx-auto text-gray-700 p-4\"><h1 class=\"max-6-xs text-6xl text-sky-700 font-thin uppercase my-16\">About Page</h1><!--$-->", "<!--/--><p class=\"mt-8\">Visit <a href=\"https://solidjs.com\" target=\"_blank\" class=\"text-sky-600 hover:underline\">solidjs.com</a> to learn how to build Solid apps.</p><p class=\"my-4\"><!--$-->", "<!--/--> - <span>About Page</span></p></main>"];
function About() {
  return ssr(_tmpl$$2, ssrHydrationKey(), escape(createComponent(Counter, {})), escape(createComponent(A, {
    href: "/",
    "class": "text-sky-600 hover:underline",
    children: "Home"
  })));
}

const _tmpl$$1 = ["<main", " class=\"text-center mx-auto text-gray-700 p-4\"><h1 class=\"max-6-xs text-6xl text-sky-700 font-thin uppercase my-16\">Hello world!</h1><!--$-->", "<!--/--><p class=\"mt-8\">Visit <a href=\"https://solidjs.com\" target=\"_blank\" class=\"text-sky-600 hover:underline\">solidjs.com</a> to learn how to build Solid apps.</p><p class=\"my-4\"><span>Home</span> - <!--$-->", "<!--/--> </p></main>"];
function Home() {
  return ssr(_tmpl$$1, ssrHydrationKey(), escape(createComponent(Counter, {})), escape(createComponent(A, {
    href: "/about",
    "class": "text-sky-600 hover:underline",
    children: "About Page"
  })));
}

/// <reference path="../server/types.tsx" />

const fileRoutes = [{
  component: NotFound,
  path: "/*404"
}, {
  component: About,
  path: "/about"
}, {
  component: Home,
  path: "/"
}];

/**
 * Routes are the file system based routes, used by Solid App Router to show the current page according to the URL.
 */

const FileRoutes = () => {
  return fileRoutes;
};

const _tmpl$ = ["<nav", " class=\"bg-sky-800\"><ul class=\"container flex items-center p-3 text-gray-200\"><li class=\"", "\">", "</li><li class=\"", "\">", "</li></ul></nav>"];
function Root() {
  const location = useLocation();
  const active = path => path == location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600";
  return createComponent(Html, {
    lang: "en",
    get children() {
      return [createComponent(Head, {
        get children() {
          return [createComponent(Title, {
            children: "SolidStart - With TailwindCSS"
          }), createComponent(Meta, {
            charset: "utf-8"
          }), createComponent(Meta, {
            name: "viewport",
            content: "width=device-width, initial-scale=1"
          })];
        }
      }), createComponent(Body, {
        get children() {
          return [createComponent(Suspense, {
            get children() {
              return createComponent(ErrorBoundary, {
                get children() {
                  return [ssr(_tmpl$, ssrHydrationKey(), `border-b-2 ${escape(active("/"), true)} mx-1.5 sm:mx-6`, escape(createComponent(A, {
                    href: "/",
                    children: "Home"
                  })), `border-b-2 ${escape(active("/about"), true)} mx-1.5 sm:mx-6`, escape(createComponent(A, {
                    href: "/about",
                    children: "About"
                  }))), createComponent(Routes, {
                    get children() {
                      return createComponent(FileRoutes, {});
                    }
                  })];
                }
              });
            }
          }), createComponent(Scripts, {})];
        }
      })];
    }
  });
}

const rootData = Object.values(/* #__PURE__ */ Object.assign({

}))[0];
const dataFn = rootData ? rootData.default : undefined;

/** Function responsible for listening for streamed [operations]{@link Operation}. */

/** Input parameters for to an Exchange factory function. */

/** Function responsible for receiving an observable [operation]{@link Operation} and returning a [result]{@link OperationResult}. */

/** This composes an array of Exchanges into a single ExchangeIO function */
const composeMiddleware = exchanges => ({
  forward
}) => exchanges.reduceRight((forward, exchange) => exchange({
  forward
}), forward);
function createHandler(...exchanges) {
  const exchange = composeMiddleware(exchanges);
  return async event => {
    return await exchange({
      forward: async op => {
        return new Response(null, {
          status: 404
        });
      }
    })(event);
  };
}
function StartRouter(props) {
  return createComponent(Router, props);
}
const docType = ssr("<!DOCTYPE html>");
function StartServer({
  event
}) {
  const parsed = new URL(event.request.url);
  const path = parsed.pathname + parsed.search;

  // @ts-ignore
  sharedConfig.context.requestContext = event;
  return createComponent(ServerContext.Provider, {
    value: event,
    get children() {
      return createComponent(MetaProvider, {
        get children() {
          return createComponent(StartRouter, {
            url: path,
            get out() {
              return event.routerContext;
            },
            location: path,
            get prevLocation() {
              return event.prevUrl;
            },
            data: dataFn,
            routes: fileRoutes,
            get children() {
              return [docType, createComponent(Root, {})];
            }
          });
        }
      });
    }
  });
}

function getRouteMatches(routes, path, method) {
  const segments = path.split("/").filter(Boolean);
  routeLoop:
    for (const route of routes) {
      const matchSegments = route.matchSegments;
      if (segments.length < matchSegments.length || !route.wildcard && segments.length > matchSegments.length) {
        continue;
      }
      for (let index = 0; index < matchSegments.length; index++) {
        const match = matchSegments[index];
        if (!match) {
          continue;
        }
        if (segments[index] !== match) {
          continue routeLoop;
        }
      }
      const handler = route[method];
      if (handler === "skip" || handler === void 0) {
        return;
      }
      const params = {};
      for (const { type, name, index } of route.params) {
        if (type === ":") {
          params[name] = segments[index];
        } else {
          params[name] = segments.slice(index).join("/");
        }
      }
      return { handler, params };
    }
}

let apiRoutes$1;
const registerApiRoutes = (routes) => {
  apiRoutes$1 = routes;
};
async function internalFetch(route, init, env = {}, locals = {}) {
  if (route.startsWith("http")) {
    return await fetch(route, init);
  }
  let url = new URL(route, "http://internal");
  const request = new Request(url.href, init);
  const handler = getRouteMatches(apiRoutes$1, url.pathname, request.method.toUpperCase());
  if (!handler) {
    throw new Error(`No handler found for ${request.method} ${request.url}`);
  }
  let apiEvent = Object.freeze({
    request,
    params: handler.params,
    clientAddress: "127.0.0.1",
    env,
    locals,
    $type: FETCH_EVENT,
    fetch: internalFetch
  });
  const response = await handler.handler(apiEvent);
  return response;
}

const api = [
  {
    GET: "skip",
    path: "/*404"
  },
  {
    GET: "skip",
    path: "/about"
  },
  {
    GET: "skip",
    path: "/"
  }
];
function expandOptionals(pattern) {
  let match = /(\/?\:[^\/]+)\?/.exec(pattern);
  if (!match)
    return [pattern];
  let prefix = pattern.slice(0, match.index);
  let suffix = pattern.slice(match.index + match[0].length);
  const prefixes = [prefix, prefix += match[1]];
  while (match = /^(\/\:[^\/]+)\?/.exec(suffix)) {
    prefixes.push(prefix += match[1]);
    suffix = suffix.slice(match[0].length);
  }
  return expandOptionals(suffix).reduce(
    (results, expansion) => [...results, ...prefixes.map((p) => p + expansion)],
    []
  );
}
function routeToMatchRoute(route) {
  const segments = route.path.split("/").filter(Boolean);
  const params = [];
  const matchSegments = [];
  let score = 0;
  let wildcard = false;
  for (const [index, segment] of segments.entries()) {
    if (segment[0] === ":") {
      const name = segment.slice(1);
      score += 3;
      params.push({
        type: ":",
        name,
        index
      });
      matchSegments.push(null);
    } else if (segment[0] === "*") {
      score -= 1;
      params.push({
        type: "*",
        name: segment.slice(1),
        index
      });
      wildcard = true;
    } else {
      score += 4;
      matchSegments.push(segment);
    }
  }
  return {
    ...route,
    score,
    params,
    matchSegments,
    wildcard
  };
}
const allRoutes = api.flatMap((route) => {
  const paths = expandOptionals(route.path);
  return paths.map((path) => ({ ...route, path }));
}).map(routeToMatchRoute).sort((a, b) => b.score - a.score);
registerApiRoutes(allRoutes);
function getApiHandler(url, method) {
  return getRouteMatches(allRoutes, url.pathname, method.toUpperCase());
}

const apiRoutes = ({ forward }) => {
  return async (event) => {
    let apiHandler = getApiHandler(new URL(event.request.url), event.request.method);
    if (apiHandler) {
      let apiEvent = Object.freeze({
        request: event.request,
        httpServer: event.httpServer,
        clientAddress: event.clientAddress,
        locals: event.locals,
        params: apiHandler.params,
        env: event.env,
        $type: FETCH_EVENT,
        fetch: event.fetch
      });
      try {
        return await apiHandler.handler(apiEvent);
      } catch (error) {
        if (error instanceof Response) {
          return error;
        }
        return new Response(
          JSON.stringify({
            error: error.message
          }),
          {
            headers: {
              "Content-Type": "application/json"
            },
            status: 500
          }
        );
      }
    }
    return await forward(event);
  };
};

const server$ = (_fn) => {
  throw new Error("Should be compiled away");
};
async function parseRequest(event) {
  let request = event.request;
  let contentType = request.headers.get(ContentTypeHeader);
  let name = new URL(request.url).pathname, args = [];
  if (contentType) {
    if (contentType === JSONResponseType) {
      let text = await request.text();
      try {
        args = JSON.parse(
          text,
          (key, value) => {
            if (!value) {
              return value;
            }
            if (value.$type === "fetch_event") {
              return event;
            }
            return value;
          }
        );
      } catch (e) {
        throw new Error(`Error parsing request body: ${text}`);
      }
    } else if (contentType.includes("form")) {
      let formData = await request.clone().formData();
      args = [formData, event];
    }
  }
  return [name, args];
}
function respondWith(request, data, responseType) {
  if (data instanceof Response) {
    if (isRedirectResponse(data) && request.headers.get(XSolidStartOrigin) === "client") {
      let headers = new Headers(data.headers);
      headers.set(XSolidStartOrigin, "server");
      headers.set(XSolidStartLocationHeader, data.headers.get(LocationHeader) ?? "/");
      headers.set(XSolidStartResponseTypeHeader, responseType);
      headers.set(XSolidStartContentTypeHeader, "response");
      return new Response(null, {
        status: 204,
        statusText: "Redirected",
        headers
      });
    } else if (data.status === 101) {
      return data;
    } else {
      let headers = new Headers(data.headers);
      headers.set(XSolidStartOrigin, "server");
      headers.set(XSolidStartResponseTypeHeader, responseType);
      headers.set(XSolidStartContentTypeHeader, "response");
      return new Response(data.body, {
        status: data.status,
        statusText: data.statusText,
        headers
      });
    }
  } else if (data instanceof FormError) {
    return new Response(
      JSON.stringify({
        error: {
          message: data.message,
          stack: "",
          formError: data.formError,
          fields: data.fields,
          fieldErrors: data.fieldErrors
        }
      }),
      {
        status: 400,
        headers: {
          [XSolidStartResponseTypeHeader]: responseType,
          [XSolidStartContentTypeHeader]: "form-error"
        }
      }
    );
  } else if (data instanceof ServerError) {
    return new Response(
      JSON.stringify({
        error: {
          message: data.message,
          stack: ""
        }
      }),
      {
        status: data.status,
        headers: {
          [XSolidStartResponseTypeHeader]: responseType,
          [XSolidStartContentTypeHeader]: "server-error"
        }
      }
    );
  } else if (data instanceof Error) {
    console.error(data);
    return new Response(
      JSON.stringify({
        error: {
          message: "Internal Server Error",
          stack: "",
          status: data.status
        }
      }),
      {
        status: data.status || 500,
        headers: {
          [XSolidStartResponseTypeHeader]: responseType,
          [XSolidStartContentTypeHeader]: "error"
        }
      }
    );
  } else if (typeof data === "object" || typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        [ContentTypeHeader]: "application/json",
        [XSolidStartResponseTypeHeader]: responseType,
        [XSolidStartContentTypeHeader]: "json"
      }
    });
  }
  return new Response("null", {
    status: 200,
    headers: {
      [ContentTypeHeader]: "application/json",
      [XSolidStartContentTypeHeader]: "json",
      [XSolidStartResponseTypeHeader]: responseType
    }
  });
}
async function handleServerRequest(event) {
  const url = new URL(event.request.url);
  if (server$.hasHandler(url.pathname)) {
    try {
      let [name, args] = await parseRequest(event);
      let handler = server$.getHandler(name);
      if (!handler) {
        throw {
          status: 404,
          message: "Handler Not Found for " + name
        };
      }
      const data = await handler.call(event, ...Array.isArray(args) ? args : [args]);
      return respondWith(event.request, data, "return");
    } catch (error) {
      return respondWith(event.request, error, "throw");
    }
  }
  return null;
}
const handlers = /* @__PURE__ */ new Map();
server$.createHandler = (_fn, hash, serverResource) => {
  let fn = function(...args) {
    let ctx;
    if (typeof this === "object") {
      ctx = this;
    } else if (sharedConfig.context && sharedConfig.context.requestContext) {
      ctx = sharedConfig.context.requestContext;
    } else {
      ctx = {
        request: new URL(hash, `http://localhost:${process.env.PORT ?? 3e3}`).href,
        responseHeaders: new Headers()
      };
    }
    const execute = async () => {
      try {
        return serverResource ? _fn.call(ctx, args[0], ctx) : _fn.call(ctx, ...args);
      } catch (e) {
        if (e instanceof Error && /[A-Za-z]+ is not defined/.test(e.message)) {
          const error = new Error(
            e.message + "\n You probably are using a variable defined in a closure in your server function."
          );
          error.stack = e.stack;
          throw error;
        }
        throw e;
      }
    };
    return execute();
  };
  fn.url = hash;
  fn.action = function(...args) {
    return fn.call(this, ...args);
  };
  return fn;
};
server$.registerHandler = function(route, handler) {
  handlers.set(route, handler);
};
server$.getHandler = function(route) {
  return handlers.get(route);
};
server$.hasHandler = function(route) {
  return handlers.has(route);
};
server$.fetch = internalFetch;

const inlineServerFunctions = ({ forward }) => {
  return async (event) => {
    const url = new URL(event.request.url);
    if (server$.hasHandler(url.pathname)) {
      let contentType = event.request.headers.get(ContentTypeHeader);
      let origin = event.request.headers.get(XSolidStartOrigin);
      let formRequestBody;
      if (contentType != null && contentType.includes("form") && !(origin != null && origin.includes("client"))) {
        let [read1, read2] = event.request.body.tee();
        formRequestBody = new Request(event.request.url, {
          body: read2,
          headers: event.request.headers,
          method: event.request.method,
          duplex: "half"
        });
        event.request = new Request(event.request.url, {
          body: read1,
          headers: event.request.headers,
          method: event.request.method,
          duplex: "half"
        });
      }
      let serverFunctionEvent = Object.freeze({
        request: event.request,
        clientAddress: event.clientAddress,
        locals: event.locals,
        fetch: event.fetch,
        $type: FETCH_EVENT,
        env: event.env
      });
      const serverResponse = await handleServerRequest(serverFunctionEvent);
      if (serverResponse) {
        let responseContentType = serverResponse.headers.get(XSolidStartContentTypeHeader);
        if (formRequestBody && responseContentType !== null && responseContentType.includes("error")) {
          const formData = await formRequestBody.formData();
          let entries = [...formData.entries()];
          return new Response(null, {
            status: 302,
            headers: {
              Location: new URL(event.request.headers.get("referer")).pathname + "?form=" + encodeURIComponent(
                JSON.stringify({
                  url: url.pathname,
                  entries,
                  ...await serverResponse.json()
                })
              )
            }
          });
        }
        return serverResponse;
      }
    }
    const response = await forward(event);
    return response;
  };
};

function renderAsync$1(fn, options) {
  return () => async (event) => {
    let pageEvent = createPageEvent(event);
    let markup = await renderToStringAsync(() => fn(pageEvent), options);
    if (pageEvent.routerContext && pageEvent.routerContext.url) {
      return redirect(pageEvent.routerContext.url, {
        headers: pageEvent.responseHeaders
      });
    }
    markup = handleIslandsRouting(pageEvent, markup);
    return new Response(markup, {
      status: pageEvent.getStatusCode(),
      headers: pageEvent.responseHeaders
    });
  };
}
function createPageEvent(event) {
  let responseHeaders = new Headers({
    "Content-Type": "text/html"
  });
  const prevPath = event.request.headers.get("x-solid-referrer");
  const mutation = event.request.headers.get("x-solid-mutation") === "true";
  let statusCode = 200;
  function setStatusCode(code) {
    statusCode = code;
  }
  function getStatusCode() {
    return statusCode;
  }
  const pageEvent = {
    request: event.request,
    prevUrl: prevPath || "",
    routerContext: {},
    mutation,
    tags: [],
    env: event.env,
    clientAddress: event.clientAddress,
    locals: event.locals,
    $type: FETCH_EVENT,
    responseHeaders,
    setStatusCode,
    getStatusCode,
    $islands: /* @__PURE__ */ new Set(),
    fetch: event.fetch
  };
  return pageEvent;
}
function handleIslandsRouting(pageEvent, markup) {
  if (pageEvent.mutation) {
    pageEvent.routerContext.replaceOutletId = "outlet-0";
    pageEvent.routerContext.newOutletId = "outlet-0";
  }
  return markup;
}

const renderAsync = (fn, options) => composeMiddleware([apiRoutes, inlineServerFunctions, renderAsync$1(fn, options)]);

const entryServer = createHandler(renderAsync(event => createComponent(StartServer, {
  event: event
})));

const onRequestGet = async ({ request, next, env }) => {
  // Handle static assets
  if (/\.\w+$/.test(new URL(request.url).pathname)) {
    let resp = await next(request);
    if (resp.status === 200 || resp.status === 304) {
      return resp;
    }
  }

  const clientAddress = request.headers.get('cf-connecting-ip');

  env.manifest = manifest;
  env.next = next;
  env.getStaticHTML = async path => {
    return next();
  };

  function internalFetch(route, init = {}) {
    if (route.startsWith("http")) {
      return fetch(route, init);
    }

    let url = new URL(route, "http://internal");
    const request = new Request(url.href, init);
    return entryServer({
      request,
      clientAddress,
      locals: {},
      env,
      fetch: internalFetch
    });
  }
  return entryServer({
    request,
    clientAddress,
    locals: {},
    env,
    fetch: internalFetch
  });
};

const onRequestHead = async ({ request, next, env }) => {
  // Handle static assets
  if (/\.\w+$/.test(new URL(request.url).pathname)) {
    let resp = await next(request);
    if (resp.status === 200 || resp.status === 304) {
      return resp;
    }
  }

  env.manifest = manifest;
  env.next = next;
  env.getStaticHTML = async path => {
    return next();
  };
  return entryServer({
    request: request,
    env
  });
};

async function onRequestPost({ request, env }) {
  // Allow for POST /_m/33fbce88a9 server function
  env.manifest = manifest;
  return entryServer({
    request: request,
    env
  });
}

async function onRequestDelete({ request, env }) {
  // Allow for POST /_m/33fbce88a9 server function
  env.manifest = manifest;
  return entryServer({
    request: request,
    env
  });
}

async function onRequestPatch({ request, env }) {
  // Allow for POST /_m/33fbce88a9 server function
  env.manifest = manifest;
  return entryServer({
    request: request,
    env
  });
}

export { onRequestDelete, onRequestGet, onRequestHead, onRequestPatch, onRequestPost };

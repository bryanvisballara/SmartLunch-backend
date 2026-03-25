!function(){function e(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function t(t){for(var r=1;r<arguments.length;r++){var i=null!=arguments[r]?arguments[r]:{};r%2?e(Object(i),!0).forEach(function(e){n(t,e,i[e])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(i)):e(Object(i)).forEach(function(e){Object.defineProperty(t,e,Object.getOwnPropertyDescriptor(i,e))})}return t}function n(e,t,n){return(t=v(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function r(){/*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */var e,t,n="function"==typeof Symbol?Symbol:{},a=n.iterator||"@@iterator",o=n.toStringTag||"@@toStringTag";function s(n,r,a,o){var s=r&&r.prototype instanceof u?r:u,f=Object.create(s.prototype);return i(f,"_invoke",function(n,r,i){var a,o,s,u=0,f=i||[],l=!1,p={p:0,n:0,v:e,a:h,f:h.bind(e,4),d:function(t,n){return a=t,o=0,s=e,p.n=n,c}};function h(n,r){for(o=n,s=r,t=0;!l&&u&&!i&&t<f.length;t++){var i,a=f[t],h=p.p,d=a[2];n>3?(i=d===r)&&(s=a[(o=a[4])?5:(o=3,3)],a[4]=a[5]=e):a[0]<=h&&((i=n<2&&h<a[1])?(o=0,p.v=r,p.n=a[1]):h<d&&(i=n<3||a[0]>r||r>d)&&(a[4]=n,a[5]=r,p.n=d,o=0))}if(i||n>1)return c;throw l=!0,r}return function(i,f,d){if(u>1)throw TypeError("Generator is already running");for(l&&1===f&&h(f,d),o=f,s=d;(t=o<2?e:s)||!l;){a||(o?o<3?(o>1&&(p.n=-1),h(o,s)):p.n=s:p.v=s);try{if(u=2,a){if(o||(i="next"),t=a[i]){if(!(t=t.call(a,s)))throw TypeError("iterator result is not an object");if(!t.done)return t;s=t.value,o<2&&(o=0)}else 1===o&&(t=a.return)&&t.call(a),o<2&&(s=TypeError("The iterator does not provide a '"+i+"' method"),o=1);a=e}else if((t=(l=p.n<0)?s:n.call(r,p))!==c)break}catch(t){a=e,o=1,s=t}finally{u=1}}return{value:t,done:l}}}(n,a,o),!0),f}var c={};function u(){}function f(){}function l(){}t=Object.getPrototypeOf;var p=[][a]?t(t([][a]())):(i(t={},a,function(){return this}),t),h=l.prototype=u.prototype=Object.create(p);function d(e){return Object.setPrototypeOf?Object.setPrototypeOf(e,l):(e.__proto__=l,i(e,o,"GeneratorFunction")),e.prototype=Object.create(h),e}return f.prototype=l,i(h,"constructor",l),i(l,"constructor",f),f.displayName="GeneratorFunction",i(l,o,"GeneratorFunction"),i(h),i(h,o,"Generator"),i(h,a,function(){return this}),i(h,"toString",function(){return"[object Generator]"}),(r=function(){return{w:s,m:d}})()}function i(e,t,n,r){var a=Object.defineProperty;try{a({},"",{})}catch(e){a=0}i=function(e,t,n,r){function o(t,n){i(e,t,function(e){return this._invoke(t,n,e)})}t?a?a(e,t,{value:n,enumerable:!r,configurable:!r,writable:!r}):e[t]=n:(o("next",0),o("throw",1),o("return",2))},i(e,t,n,r)}function a(e){return function(e){if(Array.isArray(e))return l(e)}(e)||function(e){if("undefined"!=typeof Symbol&&null!=e[Symbol.iterator]||null!=e["@@iterator"])return Array.from(e)}(e)||f(e)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function o(e,t,n,r,i,a,o){try{var s=e[a](o),c=s.value}catch(e){return void n(e)}s.done?t(c):Promise.resolve(c).then(r,i)}function s(e){return function(){var t=this,n=arguments;return new Promise(function(r,i){var a=e.apply(t,n);function s(e){o(a,r,i,s,c,"next",e)}function c(e){o(a,r,i,s,c,"throw",e)}s(void 0)})}}function c(e,t){return function(e){if(Array.isArray(e))return e}(e)||function(e,t){var n=null==e?null:"undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(null!=n){var r,i,a,o,s=[],c=!0,u=!1;try{if(a=(n=n.call(e)).next,0===t){if(Object(n)!==n)return;c=!1}else for(;!(c=(r=a.call(n)).done)&&(s.push(r.value),s.length!==t);c=!0);}catch(e){u=!0,i=e}finally{try{if(!c&&null!=n.return&&(o=n.return(),Object(o)!==o))return}finally{if(u)throw i}}return s}}(e,t)||f(e,t)||function(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function u(e,t){var n="undefined"!=typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(!n){if(Array.isArray(e)||(n=f(e))||t&&e&&"number"==typeof e.length){n&&(e=n);var r=0,i=function(){};return{s:i,n:function(){return r>=e.length?{done:!0}:{done:!1,value:e[r++]}},e:function(e){throw e},f:i}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var a,o=!0,s=!1;return{s:function(){n=n.call(e)},n:function(){var e=n.next();return o=e.done,e},e:function(e){s=!0,a=e},f:function(){try{o||null==n.return||n.return()}finally{if(s)throw a}}}}function f(e,t){if(e){if("string"==typeof e)return l(e,t);var n={}.toString.call(e).slice(8,-1);return"Object"===n&&e.constructor&&(n=e.constructor.name),"Map"===n||"Set"===n?Array.from(e):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?l(e,t):void 0}}function l(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=Array(t);n<t;n++)r[n]=e[n];return r}function p(e){return p="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},p(e)}function h(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,v(r.key),r)}}function d(e,t,n){return t&&h(e.prototype,t),n&&h(e,n),Object.defineProperty(e,"prototype",{writable:!1}),e}function v(e){var t=function(e,t){if("object"!=p(e)||!e)return e;var n=e[Symbol.toPrimitive];if(void 0!==n){var r=n.call(e,t||"default");if("object"!=p(r))return r;throw new TypeError("@@toPrimitive must return a primitive value.")}return("string"===t?String:Number)(e)}(e,"string");return"symbol"==p(t)?t:t+""}function g(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function y(e,t,n){return t=S(t),function(e,t){if(t&&("object"==p(t)||"function"==typeof t))return t;if(void 0!==t)throw new TypeError("Derived constructors may only return object or undefined");return function(e){if(void 0===e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}(e)}(e,w()?Reflect.construct(t,n||[],S(e).constructor):t.apply(e,n))}function m(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function");e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,writable:!0,configurable:!0}}),Object.defineProperty(e,"prototype",{writable:!1}),t&&k(e,t)}function b(e){var t="function"==typeof Map?new Map:void 0;return b=function(e){if(null===e||!function(e){try{return-1!==Function.toString.call(e).indexOf("[native code]")}catch(t){return"function"==typeof e}}(e))return e;if("function"!=typeof e)throw new TypeError("Super expression must either be null or a function");if(void 0!==t){if(t.has(e))return t.get(e);t.set(e,n)}function n(){return function(e,t,n){if(w())return Reflect.construct.apply(null,arguments);var r=[null];r.push.apply(r,t);var i=new(e.bind.apply(e,r));return n&&k(i,n.prototype),i}(e,arguments,S(this).constructor)}return n.prototype=Object.create(e.prototype,{constructor:{value:n,enumerable:!1,writable:!0,configurable:!0}}),k(n,e)},b(e)}function w(){try{var e=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch(e){}return(w=function(){return!!e})()}function k(e,t){return k=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(e,t){return e.__proto__=t,e},k(e,t)}function S(e){return S=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(e){return e.__proto__||Object.getPrototypeOf(e)},S(e)}System.register(["./index-legacy-By1FH_Cf.js"],function(e,i){"use strict";var o;return{setters:[function(e){o=e.W}],execute:function(){var i,f,l,h={},v=function(e){for(var t=[],n=0,r=0;r<e.length;r++){var i=e.charCodeAt(r);i<128?t[n++]=i:i<2048?(t[n++]=i>>6|192,t[n++]=63&i|128):55296==(64512&i)&&r+1<e.length&&56320==(64512&e.charCodeAt(r+1))?(i=65536+((1023&i)<<10)+(1023&e.charCodeAt(++r)),t[n++]=i>>18|240,t[n++]=i>>12&63|128,t[n++]=i>>6&63|128,t[n++]=63&i|128):(t[n++]=i>>12|224,t[n++]=i>>6&63|128,t[n++]=63&i|128)}return t},w={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:"function"==typeof atob,encodeByteArray:function(e,t){if(!Array.isArray(e))throw Error("encodeByteArray takes an array as a parameter");this.init_();for(var n=t?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[],i=0;i<e.length;i+=3){var a=e[i],o=i+1<e.length,s=o?e[i+1]:0,c=i+2<e.length,u=c?e[i+2]:0,f=a>>2,l=(3&a)<<4|s>>4,p=(15&s)<<2|u>>6,h=63&u;c||(h=64,o||(p=64)),r.push(n[f],n[l],n[p],n[h])}return r.join("")},encodeString:function(e,t){return this.HAS_NATIVE_SUPPORT&&!t?btoa(e):this.encodeByteArray(v(e),t)},decodeString:function(e,t){return this.HAS_NATIVE_SUPPORT&&!t?atob(e):function(e){for(var t=[],n=0,r=0;n<e.length;){var i=e[n++];if(i<128)t[r++]=String.fromCharCode(i);else if(i>191&&i<224){var a=e[n++];t[r++]=String.fromCharCode((31&i)<<6|63&a)}else if(i>239&&i<365){var o=((7&i)<<18|(63&e[n++])<<12|(63&e[n++])<<6|63&e[n++])-65536;t[r++]=String.fromCharCode(55296+(o>>10)),t[r++]=String.fromCharCode(56320+(1023&o))}else{var s=e[n++],c=e[n++];t[r++]=String.fromCharCode((15&i)<<12|(63&s)<<6|63&c)}}return t.join("")}(this.decodeStringToByteArray(e,t))},decodeStringToByteArray:function(e,t){this.init_();for(var n=t?this.charToByteMapWebSafe_:this.charToByteMap_,r=[],i=0;i<e.length;){var a=n[e.charAt(i++)],o=i<e.length?n[e.charAt(i)]:0,s=++i<e.length?n[e.charAt(i)]:64,c=++i<e.length?n[e.charAt(i)]:64;if(++i,null==a||null==o||null==s||null==c)throw new k;var u=a<<2|o>>4;if(r.push(u),64!==s){var f=o<<4&240|s>>2;if(r.push(f),64!==c){var l=s<<6&192|c;r.push(l)}}}return r},init_:function(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(var e=0;e<this.ENCODED_VALS.length;e++)this.byteToCharMap_[e]=this.ENCODED_VALS.charAt(e),this.charToByteMap_[this.byteToCharMap_[e]]=e,this.byteToCharMapWebSafe_[e]=this.ENCODED_VALS_WEBSAFE.charAt(e),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[e]]=e,e>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(e)]=e,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(e)]=e)}}},k=function(e){function t(){var e;return g(this,t),(e=y(this,t,arguments)).name="DecodeBase64StringError",e}return m(t,e),d(t)}(b(Error)),S=function(e){return function(e){var t=v(e);return w.encodeByteArray(t,!0)}(e).replace(/\./g,"")};
/**
             * @license
             * Copyright 2022 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
var I=function(){
/**
             * @license
             * Copyright 2022 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */return function(){if("undefined"!=typeof self)return self;if("undefined"!=typeof window)return window;if("undefined"!=typeof global)return global;throw new Error("Unable to locate global object.")}().__FIREBASE_DEFAULTS__},E=function(){if("undefined"!=typeof document){var e;try{e=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch(n){return}var t=e&&function(e){try{return w.decodeString(e,!0)}catch(n){console.error("base64Decode failed: ",n)}return null}(e[1]);return t&&JSON.parse(t)}},_=function(){try{return I()||function(){if("undefined"!=typeof process){var e=h.__FIREBASE_DEFAULTS__;return e?JSON.parse(e):void 0}}()||E()}catch(e){return void console.info("Unable to get __FIREBASE_DEFAULTS__ due to: ".concat(e))}},C=function(){var e;return null===(e=_())||void 0===e?void 0:e.config},D=function(){return d(function e(){var t=this;g(this,e),this.reject=function(){},this.resolve=function(){},this.promise=new Promise(function(e,n){t.resolve=e,t.reject=n})},[{key:"wrapCallback",value:function(e){var t=this;return function(n,r){n?t.reject(n):t.resolve(r),"function"==typeof e&&(t.promise.catch(function(){}),1===e.length?e(n):e(n,r))}}}])}();function T(){try{return"object"===("undefined"==typeof indexedDB?"undefined":p(indexedDB))}catch(e){return!1}}function O(){return new Promise(function(e,t){try{var n=!0,r="validate-browser-context-for-indexeddb-analytics-module",i=self.indexedDB.open(r);i.onsuccess=function(){i.result.close(),n||self.indexedDB.deleteDatabase(r),e(!0)},i.onupgradeneeded=function(){n=!1},i.onerror=function(){var e;t((null===(e=i.error)||void 0===e?void 0:e.message)||"")}}catch(a){t(a)}})}function A(){return!("undefined"==typeof navigator||!navigator.cookieEnabled)}
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var P=function(e){function t(e,n,r){var i;return g(this,t),(i=y(this,t,[n])).code=e,i.customData=r,i.name="FirebaseError",Object.setPrototypeOf(i,t.prototype),Error.captureStackTrace&&Error.captureStackTrace(i,j.prototype.create),i}return m(t,e),d(t)}(b(Error)),j=function(){return d(function e(t,n,r){g(this,e),this.service=t,this.serviceName=n,this.errors=r},[{key:"create",value:function(e){var t=(arguments.length<=1?void 0:arguments[1])||{},n="".concat(this.service,"/").concat(e),r=this.errors[e],i=r?function(e,t){return e.replace(N,function(e,n){var r=t[n];return null!=r?String(r):"<".concat(n,"?>")})}(r,t):"Error",a="".concat(this.serviceName,": ").concat(i," (").concat(n,").");return new P(n,a,t)}}])}();var N=/\{\$([^}]+)}/g;function M(e,t){if(e===t)return!0;for(var n=Object.keys(e),r=Object.keys(t),i=0,a=n;i<a.length;i++){var o=a[i];if(!r.includes(o))return!1;var s=e[o],c=t[o];if(B(s)&&B(c)){if(!M(s,c))return!1}else if(s!==c)return!1}for(var u=0,f=r;u<f.length;u++){var l=f[u];if(!n.includes(l))return!1}return!0}function B(e){return null!==e&&"object"===p(e)}
/**
             * @license
             * Copyright 2021 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function R(e){return e&&e._delegate?e._delegate:e}var L=function(){return d(function e(t,n,r){g(this,e),this.name=t,this.instanceFactory=n,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null},[{key:"setInstantiationMode",value:function(e){return this.instantiationMode=e,this}},{key:"setMultipleInstances",value:function(e){return this.multipleInstances=e,this}},{key:"setServiceProps",value:function(e){return this.serviceProps=e,this}},{key:"setInstanceCreatedCallback",value:function(e){return this.onInstanceCreated=e,this}}])}(),F="[DEFAULT]",H=function(){return d(function e(t,n){g(this,e),this.name=t,this.container=n,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map},[{key:"get",value:function(e){var t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){var n=new D;if(this.instancesDeferred.set(t,n),this.isInitialized(t)||this.shouldAutoInitialize())try{var r=this.getOrInitializeService({instanceIdentifier:t});r&&n.resolve(r)}catch(i){}}return this.instancesDeferred.get(t).promise}},{key:"getImmediate",value:function(e){var t,n=this.normalizeInstanceIdentifier(null==e?void 0:e.identifier),r=null!==(t=null==e?void 0:e.optional)&&void 0!==t&&t;if(!this.isInitialized(n)&&!this.shouldAutoInitialize()){if(r)return null;throw Error("Service ".concat(this.name," is not available"))}try{return this.getOrInitializeService({instanceIdentifier:n})}catch(i){if(r)return null;throw i}}},{key:"getComponent",value:function(){return this.component}},{key:"setComponent",value:function(e){if(e.name!==this.name)throw Error("Mismatching Component ".concat(e.name," for Provider ").concat(this.name,"."));if(this.component)throw Error("Component for ".concat(this.name," has already been provided"));if(this.component=e,this.shouldAutoInitialize()){if(function(e){return"EAGER"===e.instantiationMode}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */(e))try{this.getOrInitializeService({instanceIdentifier:F})}catch(f){}var t,n=u(this.instancesDeferred.entries());try{for(n.s();!(t=n.n()).done;){var r=c(t.value,2),i=r[0],a=r[1],o=this.normalizeInstanceIdentifier(i);try{var s=this.getOrInitializeService({instanceIdentifier:o});a.resolve(s)}catch(f){}}}catch(l){n.e(l)}finally{n.f()}}}},{key:"clearInstance",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:F;this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}},{key:"delete",value:(e=s(r().m(function e(){var t;return r().w(function(e){for(;;)switch(e.n){case 0:return t=Array.from(this.instances.values()),e.n=1,Promise.all([].concat(a(t.filter(function(e){return"INTERNAL"in e}).map(function(e){return e.INTERNAL.delete()})),a(t.filter(function(e){return"_delete"in e}).map(function(e){return e._delete()}))));case 1:return e.a(2)}},e,this)})),function(){return e.apply(this,arguments)})},{key:"isComponentSet",value:function(){return null!=this.component}},{key:"isInitialized",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:F;return this.instances.has(e)}},{key:"getOptions",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:F;return this.instancesOptions.get(e)||{}}},{key:"initialize",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},t=e.options,n=void 0===t?{}:t,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error("".concat(this.name,"(").concat(r,") has already been initialized"));if(!this.isComponentSet())throw Error("Component ".concat(this.name," has not been registered yet"));var i,a=this.getOrInitializeService({instanceIdentifier:r,options:n}),o=u(this.instancesDeferred.entries());try{for(o.s();!(i=o.n()).done;){var s=c(i.value,2),f=s[0],l=s[1];r===this.normalizeInstanceIdentifier(f)&&l.resolve(a)}}catch(p){o.e(p)}finally{o.f()}return a}},{key:"onInit",value:function(e,t){var n,r=this.normalizeInstanceIdentifier(t),i=null!==(n=this.onInitCallbacks.get(r))&&void 0!==n?n:new Set;i.add(e),this.onInitCallbacks.set(r,i);var a=this.instances.get(r);return a&&e(a,r),function(){i.delete(e)}}},{key:"invokeOnInitCallbacks",value:function(e,t){var n=this.onInitCallbacks.get(t);if(n){var r,i=u(n);try{for(i.s();!(r=i.n()).done;){var a=r.value;try{a(e,t)}catch(o){}}}catch(s){i.e(s)}finally{i.f()}}}},{key:"getOrInitializeService",value:function(e){var t,n=e.instanceIdentifier,r=e.options,i=void 0===r?{}:r,a=this.instances.get(n);if(!a&&this.component&&(a=this.component.instanceFactory(this.container,{instanceIdentifier:(t=n,t===F?void 0:t),options:i}),this.instances.set(n,a),this.instancesOptions.set(n,i),this.invokeOnInitCallbacks(a,n),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,n,a)}catch(o){}return a||null}},{key:"normalizeInstanceIdentifier",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:F;return this.component?this.component.multipleInstances?e:F:e}},{key:"shouldAutoInitialize",value:function(){return!!this.component&&"EXPLICIT"!==this.component.instantiationMode}}]);var e}();
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var x,V=function(){return d(function e(t){g(this,e),this.name=t,this.providers=new Map},[{key:"addComponent",value:function(e){var t=this.getProvider(e.name);if(t.isComponentSet())throw new Error("Component ".concat(e.name," has already been registered with ").concat(this.name));t.setComponent(e)}},{key:"addOrOverwriteComponent",value:function(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}},{key:"getProvider",value:function(e){if(this.providers.has(e))return this.providers.get(e);var t=new H(e,this);return this.providers.set(e,t),t}},{key:"getProviders",value:function(){return Array.from(this.providers.values())}}])}();
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */!function(e){e[e.DEBUG=0]="DEBUG",e[e.VERBOSE=1]="VERBOSE",e[e.INFO=2]="INFO",e[e.WARN=3]="WARN",e[e.ERROR=4]="ERROR",e[e.SILENT=5]="SILENT"}(x||(x={}));var K,U,W={debug:x.DEBUG,verbose:x.VERBOSE,info:x.INFO,warn:x.WARN,error:x.ERROR,silent:x.SILENT},z=x.INFO,q=n(n(n(n(n({},x.DEBUG,"log"),x.VERBOSE,"log"),x.INFO,"info"),x.WARN,"warn"),x.ERROR,"error"),$=function(e,t){if(!(t<e.logLevel)){var n=(new Date).toISOString(),r=q[t];if(!r)throw new Error("Attempted to log a message with an invalid logType (value: ".concat(t,")"));for(var i,a=arguments.length,o=new Array(a>2?a-2:0),s=2;s<a;s++)o[s-2]=arguments[s];(i=console)[r].apply(i,["[".concat(n,"]  ").concat(e.name,":")].concat(o))}},G=function(){return d(function e(t){g(this,e),this.name=t,this._logLevel=z,this._logHandler=$,this._userLogHandler=null},[{key:"logLevel",get:function(){return this._logLevel},set:function(e){if(!(e in x))throw new TypeError('Invalid value "'.concat(e,'" assigned to `logLevel`'));this._logLevel=e}},{key:"setLogLevel",value:function(e){this._logLevel="string"==typeof e?W[e]:e}},{key:"logHandler",get:function(){return this._logHandler},set:function(e){if("function"!=typeof e)throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}},{key:"userLogHandler",get:function(){return this._userLogHandler},set:function(e){this._userLogHandler=e}},{key:"debug",value:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];this._userLogHandler&&this._userLogHandler.apply(this,[this,x.DEBUG].concat(t)),this._logHandler.apply(this,[this,x.DEBUG].concat(t))}},{key:"log",value:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];this._userLogHandler&&this._userLogHandler.apply(this,[this,x.VERBOSE].concat(t)),this._logHandler.apply(this,[this,x.VERBOSE].concat(t))}},{key:"info",value:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];this._userLogHandler&&this._userLogHandler.apply(this,[this,x.INFO].concat(t)),this._logHandler.apply(this,[this,x.INFO].concat(t))}},{key:"warn",value:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];this._userLogHandler&&this._userLogHandler.apply(this,[this,x.WARN].concat(t)),this._logHandler.apply(this,[this,x.WARN].concat(t))}},{key:"error",value:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];this._userLogHandler&&this._userLogHandler.apply(this,[this,x.ERROR].concat(t)),this._logHandler.apply(this,[this,x.ERROR].concat(t))}}])}();var J=new WeakMap,Y=new WeakMap,Q=new WeakMap,X=new WeakMap,Z=new WeakMap;var ee={get:function(e,t,n){if(e instanceof IDBTransaction){if("done"===t)return Y.get(e);if("objectStoreNames"===t)return e.objectStoreNames||Q.get(e);if("store"===t)return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return re(e[t])},set:function(e,t,n){return e[t]=n,!0},has:function(e,t){return e instanceof IDBTransaction&&("done"===t||"store"===t)||t in e}};function te(e){return e!==IDBDatabase.prototype.transaction||"objectStoreNames"in IDBTransaction.prototype?(U||(U=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])).includes(e)?function(){for(var t=arguments.length,n=new Array(t),r=0;r<t;r++)n[r]=arguments[r];return e.apply(ie(this),n),re(J.get(this))}:function(){for(var t=arguments.length,n=new Array(t),r=0;r<t;r++)n[r]=arguments[r];return re(e.apply(ie(this),n))}:function(t){for(var n=arguments.length,r=new Array(n>1?n-1:0),i=1;i<n;i++)r[i-1]=arguments[i];var a=e.call.apply(e,[ie(this),t].concat(r));return Q.set(a,t.sort?t.sort():[t]),re(a)}}function ne(e){return"function"==typeof e?te(e):(e instanceof IDBTransaction&&function(e){if(!Y.has(e)){var t=new Promise(function(t,n){var r=function(){e.removeEventListener("complete",i),e.removeEventListener("error",a),e.removeEventListener("abort",a)},i=function(){t(),r()},a=function(){n(e.error||new DOMException("AbortError","AbortError")),r()};e.addEventListener("complete",i),e.addEventListener("error",a),e.addEventListener("abort",a)});Y.set(e,t)}}(e),t=e,(K||(K=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])).some(function(e){return t instanceof e})?new Proxy(e,ee):e);var t}function re(e){if(e instanceof IDBRequest)return t=e,(n=new Promise(function(e,n){var r=function(){t.removeEventListener("success",i),t.removeEventListener("error",a)},i=function(){e(re(t.result)),r()},a=function(){n(t.error),r()};t.addEventListener("success",i),t.addEventListener("error",a)})).then(function(e){e instanceof IDBCursor&&J.set(e,t)}).catch(function(){}),Z.set(n,t),n;var t,n;if(X.has(e))return X.get(e);var r=ne(e);return r!==e&&(X.set(e,r),Z.set(r,e)),r}var ie=function(e){return Z.get(e)};function ae(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{},r=n.blocked,i=n.upgrade,a=n.blocking,o=n.terminated,s=indexedDB.open(e,t),c=re(s);return i&&s.addEventListener("upgradeneeded",function(e){i(re(s.result),e.oldVersion,e.newVersion,re(s.transaction),e)}),r&&s.addEventListener("blocked",function(e){return r(e.oldVersion,e.newVersion,e)}),c.then(function(e){o&&e.addEventListener("close",function(){return o()}),a&&e.addEventListener("versionchange",function(e){return a(e.oldVersion,e.newVersion,e)})}).catch(function(){}),c}function oe(e){var t=(arguments.length>1&&void 0!==arguments[1]?arguments[1]:{}).blocked,n=indexedDB.deleteDatabase(e);return t&&n.addEventListener("blocked",function(e){return t(e.oldVersion,e)}),re(n).then(function(){})}var se=["get","getKey","getAll","getAllKeys","count"],ce=["put","add","delete","clear"],ue=new Map;function fe(e,t){if(e instanceof IDBDatabase&&!(t in e)&&"string"==typeof t){if(ue.get(t))return ue.get(t);var n=t.replace(/FromIndex$/,""),i=t!==n,a=ce.includes(n);if(n in(i?IDBIndex:IDBObjectStore).prototype&&(a||se.includes(n))){var o=function(){var e=s(r().m(function e(t){var o,s,c,u,f,l,p=arguments;return r().w(function(e){for(;;)switch(e.n){case 0:for(s=this.transaction(t,a?"readwrite":"readonly"),c=s.store,u=p.length,f=new Array(u>1?u-1:0),l=1;l<u;l++)f[l-1]=p[l];return i&&(c=c.index(f.shift())),e.n=1,Promise.all([(o=c)[n].apply(o,f),a&&s.done]);case 1:return e.a(2,e.v[0])}},e,this)}));return function(t){return e.apply(this,arguments)}}();return ue.set(t,o),o}}}ee=function(e){return t(t({},e),{},{get:function(t,n,r){return fe(t,n)||e.get(t,n,r)},has:function(t,n){return!!fe(t,n)||e.has(t,n)}})}(ee);
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
var le=function(){return d(function e(t){g(this,e),this.container=t},[{key:"getPlatformInfoString",value:function(){return this.container.getProviders().map(function(e){if(function(e){var t=e.getComponent();return"VERSION"===(null==t?void 0:t.type)}(e)){var t=e.getImmediate();return"".concat(t.library,"/").concat(t.version)}return null}).filter(function(e){return e}).join(" ")}}])}();var pe="@firebase/app",he="0.14.10",de=new G("@firebase/app"),ve="[DEFAULT]",ge=(n(n(n(n(n(n(n(n(n(n(i={},pe,"fire-core"),"@firebase/app-compat","fire-core-compat"),"@firebase/analytics","fire-analytics"),"@firebase/analytics-compat","fire-analytics-compat"),"@firebase/app-check","fire-app-check"),"@firebase/app-check-compat","fire-app-check-compat"),"@firebase/auth","fire-auth"),"@firebase/auth-compat","fire-auth-compat"),"@firebase/database","fire-rtdb"),"@firebase/data-connect","fire-data-connect"),n(n(n(n(n(n(n(n(n(n(i,"@firebase/database-compat","fire-rtdb-compat"),"@firebase/functions","fire-fn"),"@firebase/functions-compat","fire-fn-compat"),"@firebase/installations","fire-iid"),"@firebase/installations-compat","fire-iid-compat"),"@firebase/messaging","fire-fcm"),"@firebase/messaging-compat","fire-fcm-compat"),"@firebase/performance","fire-perf"),"@firebase/performance-compat","fire-perf-compat"),"@firebase/remote-config","fire-rc"),n(n(n(n(n(n(n(n(i,"@firebase/remote-config-compat","fire-rc-compat"),"@firebase/storage","fire-gcs"),"@firebase/storage-compat","fire-gcs-compat"),"@firebase/firestore","fire-fst"),"@firebase/firestore-compat","fire-fst-compat"),"@firebase/ai","fire-vertex"),"fire-js","fire-js"),"firebase","fire-js-all")),ye=new Map,me=new Map,be=new Map;function we(e,t){try{e.container.addComponent(t)}catch(n){de.debug("Component ".concat(t.name," failed to register with FirebaseApp ").concat(e.name),n)}}function ke(e){var t=e.name;if(be.has(t))return de.debug("There were multiple attempts to register component ".concat(t,".")),!1;be.set(t,e);var n,r=u(ye.values());try{for(r.s();!(n=r.n()).done;){we(n.value,e)}}catch(o){r.e(o)}finally{r.f()}var i,a=u(me.values());try{for(a.s();!(i=a.n()).done;){we(i.value,e)}}catch(o){a.e(o)}finally{a.f()}return!0}function Se(e,t){var n=e.container.getProvider("heartbeat").getImmediate({optional:!0});return n&&n.triggerHeartbeat(),e.container.getProvider(t)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Ie=(n(n(n(n(n(n(n(n(n(n(f={},"no-app","No Firebase App '{$appName}' has been created - call initializeApp() first"),"bad-app-name","Illegal App name: '{$appName}'"),"duplicate-app","Firebase App named '{$appName}' already exists with different options or config"),"app-deleted","Firebase App named '{$appName}' already deleted"),"server-app-deleted","Firebase Server App has been deleted"),"no-options","Need to provide options, when not being deployed to hosting via source."),"invalid-app-argument","firebase.{$appName}() takes either no argument or a Firebase App instance."),"invalid-log-argument","First argument to `onLog` must be null or a function."),"idb-open","Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}."),"idb-get","Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}."),n(n(n(n(f,"idb-set","Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}."),"idb-delete","Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}."),"finalization-registry-not-supported","FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry."),"invalid-server-app-environment","FirebaseServerApp is not for use in browser environments.")),Ee=new j("app","Firebase",Ie),_e=function(){return d(function e(n,r,i){var a=this;g(this,e),this._isDeleted=!1,this._options=t({},n),this._config=t({},r),this._name=r.name,this._automaticDataCollectionEnabled=r.automaticDataCollectionEnabled,this._container=i,this.container.addComponent(new L("app",function(){return a},"PUBLIC"))},[{key:"automaticDataCollectionEnabled",get:function(){return this.checkDestroyed(),this._automaticDataCollectionEnabled},set:function(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}},{key:"name",get:function(){return this.checkDestroyed(),this._name}},{key:"options",get:function(){return this.checkDestroyed(),this._options}},{key:"config",get:function(){return this.checkDestroyed(),this._config}},{key:"container",get:function(){return this._container}},{key:"isDeleted",get:function(){return this._isDeleted},set:function(e){this._isDeleted=e}},{key:"checkDestroyed",value:function(){if(this.isDeleted)throw Ee.create("app-deleted",{appName:this._name})}}])}();function Ce(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:ve,n=ye.get(e);if(!n&&e===ve&&C())return function(e){var n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},r=e;"object"!==p(n)&&(n={name:n});var i=t({name:ve,automaticDataCollectionEnabled:!0},n),a=i.name;if("string"!=typeof a||!a)throw Ee.create("bad-app-name",{appName:String(a)});if(r||(r=C()),!r)throw Ee.create("no-options");var o=ye.get(a);if(o){if(M(r,o.options)&&M(i,o.config))return o;throw Ee.create("duplicate-app",{appName:a})}var s,c=new V(a),f=u(be.values());try{for(f.s();!(s=f.n()).done;){var l=s.value;c.addComponent(l)}}catch(d){f.e(d)}finally{f.f()}var h=new _e(r,i,c);return ye.set(a,h),h}();if(!n)throw Ee.create("no-app",{appName:e});return n}function De(e,t,n){var r,i=null!==(r=ge[e])&&void 0!==r?r:e;n&&(i+="-".concat(n));var a=i.match(/\s|\//),o=t.match(/\s|\//);if(a||o){var s=['Unable to register library "'.concat(i,'" with version "').concat(t,'":')];return a&&s.push('library name "'.concat(i,'" contains illegal characters (whitespace or "/")')),a&&o&&s.push("and"),o&&s.push('version name "'.concat(t,'" contains illegal characters (whitespace or "/")')),void de.warn(s.join(" "))}ke(new L("".concat(i,"-version"),function(){return{library:i,version:t}},"VERSION"))}
/**
             * @license
             * Copyright 2021 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Te="firebase-heartbeat-store",Oe=null;function Ae(){return Oe||(Oe=ae("firebase-heartbeat-database",1,{upgrade:function(e,t){if(0===t)try{e.createObjectStore(Te)}catch(n){console.warn(n)}}}).catch(function(e){throw Ee.create("idb-open",{originalErrorMessage:e.message})})),Oe}function Pe(e){return je.apply(this,arguments)}function je(){return(je=s(r().m(function e(t){var n,i,a,o,s;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,Ae();case 1:return n=e.v,i=n.transaction(Te),e.n=2,i.objectStore(Te).get(Be(t));case 2:return a=e.v,e.n=3,i.done;case 3:return e.a(2,a);case 4:e.p=4,(s=e.v)instanceof P?de.warn(s.message):(o=Ee.create("idb-get",{originalErrorMessage:null==s?void 0:s.message}),de.warn(o.message));case 5:return e.a(2)}},e,null,[[0,4]])}))).apply(this,arguments)}function Ne(e,t){return Me.apply(this,arguments)}function Me(){return(Me=s(r().m(function e(t,n){var i,a,o,s,c;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,Ae();case 1:return i=e.v,a=i.transaction(Te,"readwrite"),o=a.objectStore(Te),e.n=2,o.put(n,Be(t));case 2:return e.n=3,a.done;case 3:e.n=5;break;case 4:e.p=4,(c=e.v)instanceof P?de.warn(c.message):(s=Ee.create("idb-set",{originalErrorMessage:null==c?void 0:c.message}),de.warn(s.message));case 5:return e.a(2)}},e,null,[[0,4]])}))).apply(this,arguments)}function Be(e){return"".concat(e.name,"!").concat(e.options.appId)}
/**
             * @license
             * Copyright 2021 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Re=function(){return d(function e(t){var n=this;g(this,e),this.container=t,this._heartbeatsCache=null;var r=this.container.getProvider("app").getImmediate();this._storage=new xe(r),this._heartbeatsCachePromise=this._storage.read().then(function(e){return n._heartbeatsCache=e,e})},[{key:"triggerHeartbeat",value:(t=s(r().m(function e(){var t,n,i,a,o,s,c;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:if(e.p=0,n=this.container.getProvider("platform-logger").getImmediate(),i=n.getPlatformInfoString(),a=Le(),null!=(null===(t=this._heartbeatsCache)||void 0===t?void 0:t.heartbeats)){e.n=2;break}return e.n=1,this._heartbeatsCachePromise;case 1:if(this._heartbeatsCache=e.v,null!=(null===(o=this._heartbeatsCache)||void 0===o?void 0:o.heartbeats)){e.n=2;break}return e.a(2);case 2:if(this._heartbeatsCache.lastSentHeartbeatDate!==a&&!this._heartbeatsCache.heartbeats.some(function(e){return e.date===a})){e.n=3;break}return e.a(2);case 3:this._heartbeatsCache.heartbeats.push({date:a,agent:i}),this._heartbeatsCache.heartbeats.length>30&&(s=Ke(this._heartbeatsCache.heartbeats),this._heartbeatsCache.heartbeats.splice(s,1));case 4:return e.a(2,this._storage.overwrite(this._heartbeatsCache));case 5:e.p=5,c=e.v,de.warn(c);case 6:return e.a(2)}},e,this,[[0,5]])})),function(){return t.apply(this,arguments)})},{key:"getHeartbeatsHeader",value:(e=s(r().m(function e(){var t,n,i,a,o,s,c;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:if(e.p=0,null!==this._heartbeatsCache){e.n=1;break}return e.n=1,this._heartbeatsCachePromise;case 1:if(null!=(null===(t=this._heartbeatsCache)||void 0===t?void 0:t.heartbeats)&&0!==this._heartbeatsCache.heartbeats.length){e.n=2;break}return e.a(2,"");case 2:if(n=Le(),i=Fe(this._heartbeatsCache.heartbeats),a=i.heartbeatsToSend,o=i.unsentEntries,s=S(JSON.stringify({version:2,heartbeats:a})),this._heartbeatsCache.lastSentHeartbeatDate=n,!(o.length>0)){e.n=4;break}return this._heartbeatsCache.heartbeats=o,e.n=3,this._storage.overwrite(this._heartbeatsCache);case 3:e.n=5;break;case 4:this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache);case 5:return e.a(2,s);case 6:return e.p=6,c=e.v,de.warn(c),e.a(2,"")}},e,this,[[0,6]])})),function(){return e.apply(this,arguments)})}]);var e,t}();function Le(){return(new Date).toISOString().substring(0,10)}function Fe(e){var t,n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:1024,r=[],i=e.slice(),a=u(e);try{var o=function(){var e=t.value,a=r.find(function(t){return t.agent===e.agent});if(a){if(a.dates.push(e.date),Ve(r)>n)return a.dates.pop(),0}else if(r.push({agent:e.agent,dates:[e.date]}),Ve(r)>n)return r.pop(),0;i=i.slice(1)};for(a.s();!(t=a.n()).done&&0!==o(););}catch(s){a.e(s)}finally{a.f()}return{heartbeatsToSend:r,unsentEntries:i}}var He,xe=function(){return d(function e(t){g(this,e),this.app=t,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()},[{key:"runIndexedDBEnvironmentCheck",value:(i=s(r().m(function e(){return r().w(function(e){for(;;)switch(e.n){case 0:if(T()){e.n=1;break}return e.a(2,!1);case 1:return e.a(2,O().then(function(){return!0}).catch(function(){return!1}));case 2:return e.a(2)}},e)})),function(){return i.apply(this,arguments)})},{key:"read",value:(n=s(r().m(function e(){var t;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,this._canUseIndexedDBPromise;case 1:if(e.v){e.n=2;break}return e.a(2,{heartbeats:[]});case 2:return e.n=3,Pe(this.app);case 3:if(null==(t=e.v)||!t.heartbeats){e.n=4;break}return e.a(2,t);case 4:return e.a(2,{heartbeats:[]});case 5:return e.a(2)}},e,this)})),function(){return n.apply(this,arguments)})},{key:"overwrite",value:(t=s(r().m(function e(t){var n,i;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,this._canUseIndexedDBPromise;case 1:if(e.v){e.n=2;break}return e.a(2);case 2:return e.n=3,this.read();case 3:return i=e.v,e.a(2,Ne(this.app,{lastSentHeartbeatDate:null!==(n=t.lastSentHeartbeatDate)&&void 0!==n?n:i.lastSentHeartbeatDate,heartbeats:t.heartbeats}));case 4:return e.a(2)}},e,this)})),function(e){return t.apply(this,arguments)})},{key:"add",value:(e=s(r().m(function e(t){var n,i;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,this._canUseIndexedDBPromise;case 1:if(e.v){e.n=2;break}return e.a(2);case 2:return e.n=3,this.read();case 3:return i=e.v,e.a(2,Ne(this.app,{lastSentHeartbeatDate:null!==(n=t.lastSentHeartbeatDate)&&void 0!==n?n:i.lastSentHeartbeatDate,heartbeats:[].concat(a(i.heartbeats),a(t.heartbeats))}));case 4:return e.a(2)}},e,this)})),function(t){return e.apply(this,arguments)})}]);var e,t,n,i}();function Ve(e){return S(JSON.stringify({version:2,heartbeats:e})).length}function Ke(e){if(0===e.length)return-1;for(var t=0,n=e[0].date,r=1;r<e.length;r++)e[r].date<n&&(n=e[r].date,t=r);return t}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */He="",ke(new L("platform-logger",function(e){return new le(e)},"PRIVATE")),ke(new L("heartbeat",function(e){return new Re(e)},"PRIVATE")),De(pe,he,He),De(pe,he,"esm2020"),De("fire-js","");var Ue="@firebase/installations",We="0.6.21",ze=1e4,qe="w:".concat(We),$e="FIS_v2",Ge=36e5,Je=n(n(n(n(n(n({},"missing-app-config-values",'Missing App configuration value: "{$valueName}"'),"not-registered","Firebase Installation is not registered."),"installation-not-found","Firebase Installation not found."),"request-failed",'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"'),"app-offline","Could not process request. Application offline."),"delete-pending-registration","Can't delete installation while there is a pending registration request."),Ye=new j("installations","Installations",Je);function Qe(e){return e instanceof P&&e.code.includes("request-failed")}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Xe(e){var t=e.projectId;return"".concat("https://firebaseinstallations.googleapis.com/v1","/projects/").concat(t,"/installations")}function Ze(e){return{token:e.token,requestStatus:2,expiresIn:(t=e.expiresIn,Number(t.replace("s","000"))),creationTime:Date.now()};var t}function et(e,t){return tt.apply(this,arguments)}function tt(){return(tt=s(r().m(function e(t,n){var i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,n.json();case 1:return i=e.v,a=i.error,e.a(2,Ye.create("request-failed",{requestName:t,serverCode:a.code,serverMessage:a.message,serverStatus:a.status}))}},e)}))).apply(this,arguments)}function nt(e){var t=e.apiKey;return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":t})}function rt(e,t){var n=t.refreshToken,r=nt(e);return r.append("Authorization",function(e){return"".concat($e," ").concat(e)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */(n)),r}function it(e){return at.apply(this,arguments)}function at(){return(at=s(r().m(function e(t){var n;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,t();case 1:if(!((n=e.v).status>=500&&n.status<600)){e.n=2;break}return e.a(2,t());case 2:return e.a(2,n)}},e)}))).apply(this,arguments)}function ot(e,t){return st.apply(this,arguments)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function st(){return(st=s(r().m(function e(t,n){var i,a,o,s,c,u,f,l,p,h,d,v;return r().w(function(e){for(;;)switch(e.n){case 0:if(i=t.appConfig,a=t.heartbeatServiceProvider,o=n.fid,s=Xe(i),c=nt(i),!(u=a.getImmediate({optional:!0}))){e.n=2;break}return e.n=1,u.getHeartbeatsHeader();case 1:(f=e.v)&&c.append("x-firebase-client",f);case 2:return l={fid:o,authVersion:$e,appId:i.appId,sdkVersion:qe},p={method:"POST",headers:c,body:JSON.stringify(l)},e.n=3,it(function(){return fetch(s,p)});case 3:if(!(h=e.v).ok){e.n=5;break}return e.n=4,h.json();case 4:return d=e.v,v={fid:d.fid||o,registrationStatus:2,refreshToken:d.refreshToken,authToken:Ze(d.authToken)},e.a(2,v);case 5:return e.n=6,et("Create Installation",h);case 6:throw e.v;case 7:return e.a(2)}},e)}))).apply(this,arguments)}function ct(e){return new Promise(function(t){setTimeout(t,e)})}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
var ut=/^[cdef][\w-]{21}$/;function ft(){try{var e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;var t=function(e){var t=(n=e,btoa(String.fromCharCode.apply(String,a(n))).replace(/\+/g,"-").replace(/\//g,"_"));var n;return t.substr(0,22)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */(e);return ut.test(t)?t:""}catch(n){return""}}function lt(e){return"".concat(e.appName,"!").concat(e.appId)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var pt=new Map;function ht(e,t){var n=lt(e);dt(n,t),function(e,t){var n=function(){!vt&&"BroadcastChannel"in self&&((vt=new BroadcastChannel("[Firebase] FID Change")).onmessage=function(e){dt(e.data.key,e.data.fid)});return vt}();n&&n.postMessage({key:e,fid:t});0===pt.size&&vt&&(vt.close(),vt=null)}(n,t)}function dt(e,t){var n=pt.get(e);if(n){var r,i=u(n);try{for(i.s();!(r=i.n()).done;){(0,r.value)(t)}}catch(a){i.e(a)}finally{i.f()}}}var vt=null;
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
var gt="firebase-installations-store",yt=null;function mt(){return yt||(yt=ae("firebase-installations-database",1,{upgrade:function(e,t){if(0===t)e.createObjectStore(gt)}})),yt}function bt(e,t){return wt.apply(this,arguments)}function wt(){return(wt=s(r().m(function e(t,n){var i,a,o,s,c;return r().w(function(e){for(;;)switch(e.n){case 0:return i=lt(t),e.n=1,mt();case 1:return a=e.v,o=a.transaction(gt,"readwrite"),s=o.objectStore(gt),e.n=2,s.get(i);case 2:return c=e.v,e.n=3,s.put(n,i);case 3:return e.n=4,o.done;case 4:return c&&c.fid===n.fid||ht(t,n.fid),e.a(2,n)}},e)}))).apply(this,arguments)}function kt(e){return St.apply(this,arguments)}function St(){return(St=s(r().m(function e(t){var n,i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return n=lt(t),e.n=1,mt();case 1:return i=e.v,a=i.transaction(gt,"readwrite"),e.n=2,a.objectStore(gt).delete(n);case 2:return e.n=3,a.done;case 3:return e.a(2)}},e)}))).apply(this,arguments)}function It(e,t){return Et.apply(this,arguments)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Et(){return(Et=s(r().m(function e(t,n){var i,a,o,s,c,u;return r().w(function(e){for(;;)switch(e.n){case 0:return i=lt(t),e.n=1,mt();case 1:return a=e.v,o=a.transaction(gt,"readwrite"),s=o.objectStore(gt),e.n=2,s.get(i);case 2:if(c=e.v,void 0!==(u=n(c))){e.n=4;break}return e.n=3,s.delete(i);case 3:e.n=5;break;case 4:return e.n=5,s.put(u,i);case 5:return e.n=6,o.done;case 6:return!u||c&&c.fid===u.fid||ht(t,u.fid),e.a(2,u)}},e)}))).apply(this,arguments)}function _t(e){return Ct.apply(this,arguments)}function Ct(){return(Ct=s(r().m(function e(t){var n,i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,It(t.appConfig,function(e){var r=Dt(e),i=Tt(t,r);return n=i.registrationPromise,i.installationEntry});case 1:if(""!==(i=e.v).fid){e.n=3;break}return e.n=2,n;case 2:return a=e.v,e.a(2,{installationEntry:a});case 3:return e.a(2,{installationEntry:i,registrationPromise:n})}},e)}))).apply(this,arguments)}function Dt(e){return Nt(e||{fid:ft(),registrationStatus:0})}function Tt(e,t){if(0===t.registrationStatus){if(!navigator.onLine)return{installationEntry:t,registrationPromise:Promise.reject(Ye.create("app-offline"))};var n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},r=function(e,t){return Ot.apply(this,arguments)}(e,n);return{installationEntry:n,registrationPromise:r}}return 1===t.registrationStatus?{installationEntry:t,registrationPromise:At(e)}:{installationEntry:t}}function Ot(){return(Ot=s(r().m(function e(t,n){var i,a;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,ot(t,n);case 1:return i=e.v,e.a(2,bt(t.appConfig,i));case 2:if(e.p=2,!Qe(a=e.v)||409!==a.customData.serverCode){e.n=4;break}return e.n=3,kt(t.appConfig);case 3:e.n=5;break;case 4:return e.n=5,bt(t.appConfig,{fid:n.fid,registrationStatus:0});case 5:throw a;case 6:return e.a(2)}},e,null,[[0,2]])}))).apply(this,arguments)}function At(e){return Pt.apply(this,arguments)}function Pt(){return(Pt=s(r().m(function e(t){var n,i,a,o;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,jt(t.appConfig);case 1:n=e.v;case 2:if(1!==n.registrationStatus){e.n=5;break}return e.n=3,ct(100);case 3:return e.n=4,jt(t.appConfig);case 4:n=e.v,e.n=2;break;case 5:if(0!==n.registrationStatus){e.n=8;break}return e.n=6,_t(t);case 6:if(i=e.v,a=i.installationEntry,!(o=i.registrationPromise)){e.n=7;break}return e.a(2,o);case 7:return e.a(2,a);case 8:return e.a(2,n)}},e)}))).apply(this,arguments)}function jt(e){return It(e,function(e){if(!e)throw Ye.create("installation-not-found");return Nt(e)})}function Nt(e){return 1===(t=e).registrationStatus&&t.registrationTime+ze<Date.now()?{fid:e.fid,registrationStatus:0}:e;var t;
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */}function Mt(e,t){return Bt.apply(this,arguments)}function Bt(){return(Bt=s(r().m(function e(t,n){var i,a,o,s,c,u,f,l,p,h,d;return r().w(function(e){for(;;)switch(e.n){case 0:if(i=t.appConfig,a=t.heartbeatServiceProvider,o=Rt(i,n),s=rt(i,n),!(c=a.getImmediate({optional:!0}))){e.n=2;break}return e.n=1,c.getHeartbeatsHeader();case 1:(u=e.v)&&s.append("x-firebase-client",u);case 2:return f={installation:{sdkVersion:qe,appId:i.appId}},l={method:"POST",headers:s,body:JSON.stringify(f)},e.n=3,it(function(){return fetch(o,l)});case 3:if(!(p=e.v).ok){e.n=5;break}return e.n=4,p.json();case 4:return h=e.v,d=Ze(h),e.a(2,d);case 5:return e.n=6,et("Generate Auth Token",p);case 6:throw e.v;case 7:return e.a(2)}},e)}))).apply(this,arguments)}function Rt(e,t){var n=t.fid;return"".concat(Xe(e),"/").concat(n,"/authTokens:generate")}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Lt(e){return Ft.apply(this,arguments)}function Ft(){return Ft=s(r().m(function e(t){var n,i,a,o,s,c=arguments;return r().w(function(e){for(;;)switch(e.n){case 0:return n=c.length>1&&void 0!==c[1]&&c[1],e.n=1,It(t.appConfig,function(e){if(!Wt(e))throw Ye.create("not-registered");var r=e.authToken;if(!n&&zt(r))return e;if(1===r.requestStatus)return i=Ht(t,n),e;if(!navigator.onLine)throw Ye.create("app-offline");var a=qt(e);return i=Kt(t,a),a});case 1:if(a=e.v,!i){e.n=3;break}return e.n=2,i;case 2:s=e.v,e.n=4;break;case 3:s=a.authToken;case 4:return o=s,e.a(2,o)}},e)})),Ft.apply(this,arguments)}function Ht(e,t){return xt.apply(this,arguments)}function xt(){return(xt=s(r().m(function e(t,n){var i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,Vt(t.appConfig);case 1:i=e.v;case 2:if(1!==i.authToken.requestStatus){e.n=5;break}return e.n=3,ct(100);case 3:return e.n=4,Vt(t.appConfig);case 4:i=e.v,e.n=2;break;case 5:if(0!==(a=i.authToken).requestStatus){e.n=6;break}return e.a(2,Lt(t,n));case 6:return e.a(2,a);case 7:return e.a(2)}},e)}))).apply(this,arguments)}function Vt(e){return It(e,function(e){if(!Wt(e))throw Ye.create("not-registered");var n,r=e.authToken;return 1===(n=r).requestStatus&&n.requestTime+ze<Date.now()?t(t({},e),{},{authToken:{requestStatus:0}}):e})}function Kt(e,t){return Ut.apply(this,arguments)}function Ut(){return(Ut=s(r().m(function e(n,i){var a,o,s,c;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,Mt(n,i);case 1:return a=e.v,o=t(t({},i),{},{authToken:a}),e.n=2,bt(n.appConfig,o);case 2:return e.a(2,a);case 3:if(e.p=3,!Qe(c=e.v)||401!==c.customData.serverCode&&404!==c.customData.serverCode){e.n=5;break}return e.n=4,kt(n.appConfig);case 4:e.n=6;break;case 5:return s=t(t({},i),{},{authToken:{requestStatus:0}}),e.n=6,bt(n.appConfig,s);case 6:throw c;case 7:return e.a(2)}},e,null,[[0,3]])}))).apply(this,arguments)}function Wt(e){return void 0!==e&&2===e.registrationStatus}function zt(e){return 2===e.requestStatus&&!function(e){var t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Ge}(e)}function qt(e){var n={requestStatus:1,requestTime:Date.now()};return t(t({},e),{},{authToken:n})}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function $t(){return($t=s(r().m(function e(t){var n,i,a,o;return r().w(function(e){for(;;)switch(e.n){case 0:return n=t,e.n=1,_t(n);case 1:return i=e.v,a=i.installationEntry,(o=i.registrationPromise)?o.catch(console.error):Lt(n).catch(console.error),e.a(2,a.fid)}},e)}))).apply(this,arguments)}function Gt(){return Gt=s(r().m(function e(t){var n,i,a,o=arguments;return r().w(function(e){for(;;)switch(e.n){case 0:return n=o.length>1&&void 0!==o[1]&&o[1],i=t,e.n=1,Jt(i);case 1:return e.n=2,Lt(i,n);case 2:return a=e.v,e.a(2,a.token)}},e)})),Gt.apply(this,arguments)}function Jt(e){return Yt.apply(this,arguments)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Yt(){return(Yt=s(r().m(function e(t){var n,i;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,_t(t);case 1:if(n=e.v,!(i=n.registrationPromise)){e.n=2;break}return e.n=2,i;case 2:return e.a(2)}},e)}))).apply(this,arguments)}function Qt(e){return Ye.create("missing-app-config-values",{valueName:e})}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Xt="installations",Zt=function(e){var t=Se(e.getProvider("app").getImmediate(),Xt).getImmediate(),n={getId:function(){
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */return function(e){return $t.apply(this,arguments)}(t)},getToken:function(e){return function(e){return Gt.apply(this,arguments)}(t,e)}};return n};ke(new L(Xt,function(e){var t=e.getProvider("app").getImmediate(),n=function(e){if(!e||!e.options)throw Qt("App Configuration");if(!e.name)throw Qt("App Name");for(var t=0,n=["projectId","apiKey","appId"];t<n.length;t++){var r=n[t];if(!e.options[r])throw Qt(r)}return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}(t);return{app:t,appConfig:n,heartbeatServiceProvider:Se(t,"heartbeat"),_delete:function(){return Promise.resolve()}}},"PUBLIC")),ke(new L("installations-internal",Zt,"PRIVATE")),De(Ue,We),De(Ue,We,"esm2020");
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
var en,tn,nn="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",rn="google.c.a.c_id";
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function an(e){var t=new Uint8Array(e);return btoa(String.fromCharCode.apply(String,a(t))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function on(e){for(var t=(e+"=".repeat((4-e.length%4)%4)).replace(/\-/g,"+").replace(/_/g,"/"),n=atob(t),r=new Uint8Array(n.length),i=0;i<n.length;++i)r[i]=n.charCodeAt(i);return r}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */!function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"}(en||(en={})),function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"}(tn||(tn={}));var sn="fcm_token_details_db",cn="fcm_token_object_Store";function un(e){return fn.apply(this,arguments)}function fn(){return fn=s(r().m(function e(t){var n,i,a;return r().w(function(e){for(;;)switch(e.n){case 0:if(!("databases"in indexedDB)){e.n=2;break}return e.n=1,indexedDB.databases();case 1:if(n=e.v,i=n.map(function(e){return e.name}),i.includes(sn)){e.n=2;break}return e.a(2,null);case 2:return a=null,e.n=3,ae(sn,5,{upgrade:function(){var e=s(r().m(function e(n,i,o,s){var c,u,f,l,p,h;return r().w(function(e){for(;;)switch(e.n){case 0:if(!(i<2)){e.n=1;break}return e.a(2);case 1:if(n.objectStoreNames.contains(cn)){e.n=2;break}return e.a(2);case 2:return c=s.objectStore(cn),e.n=3,c.index("fcmSenderId").get(t);case 3:return u=e.v,e.n=4,c.clear();case 4:if(u){e.n=5;break}return e.a(2);case 5:if(2!==i){e.n=7;break}if((l=u).auth&&l.p256dh&&l.endpoint){e.n=6;break}return e.a(2);case 6:a={token:l.fcmToken,createTime:null!==(f=l.createTime)&&void 0!==f?f:Date.now(),subscriptionOptions:{auth:l.auth,p256dh:l.p256dh,endpoint:l.endpoint,swScope:l.swScope,vapidKey:"string"==typeof l.vapidKey?l.vapidKey:an(l.vapidKey)}},e.n=8;break;case 7:3===i?a={token:(p=u).fcmToken,createTime:p.createTime,subscriptionOptions:{auth:an(p.auth),p256dh:an(p.p256dh),endpoint:p.endpoint,swScope:p.swScope,vapidKey:an(p.vapidKey)}}:4===i&&(a={token:(h=u).fcmToken,createTime:h.createTime,subscriptionOptions:{auth:an(h.auth),p256dh:an(h.p256dh),endpoint:h.endpoint,swScope:h.swScope,vapidKey:an(h.vapidKey)}});case 8:return e.a(2)}},e)}));return function(t,n,r,i){return e.apply(this,arguments)}}()});case 3:return e.v.close(),e.n=4,oe(sn);case 4:return e.n=5,oe("fcm_vapid_details_db");case 5:return e.n=6,oe("undefined");case 6:return e.a(2,ln(a)?a:null)}},e)})),fn.apply(this,arguments)}function ln(e){if(!e||!e.subscriptionOptions)return!1;var t=e.subscriptionOptions;return"number"==typeof e.createTime&&e.createTime>0&&"string"==typeof e.token&&e.token.length>0&&"string"==typeof t.auth&&t.auth.length>0&&"string"==typeof t.p256dh&&t.p256dh.length>0&&"string"==typeof t.endpoint&&t.endpoint.length>0&&"string"==typeof t.swScope&&t.swScope.length>0&&"string"==typeof t.vapidKey&&t.vapidKey.length>0}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var pn="firebase-messaging-store",hn=null;function dn(){return hn||(hn=ae("firebase-messaging-database",1,{upgrade:function(e,t){if(0===t)e.createObjectStore(pn)}})),hn}function vn(e){return gn.apply(this,arguments)}function gn(){return(gn=s(r().m(function e(t){var n,i,a,o;return r().w(function(e){for(;;)switch(e.n){case 0:return n=kn(t),e.n=1,dn();case 1:return i=e.v,e.n=2,i.transaction(pn).objectStore(pn).get(n);case 2:if(!(a=e.v)){e.n=3;break}return e.a(2,a);case 3:return e.n=4,un(t.appConfig.senderId);case 4:if(!(o=e.v)){e.n=6;break}return e.n=5,yn(t,o);case 5:return e.a(2,o);case 6:return e.a(2)}},e)}))).apply(this,arguments)}function yn(e,t){return mn.apply(this,arguments)}function mn(){return(mn=s(r().m(function e(t,n){var i,a,o;return r().w(function(e){for(;;)switch(e.n){case 0:return i=kn(t),e.n=1,dn();case 1:return a=e.v,o=a.transaction(pn,"readwrite"),e.n=2,o.objectStore(pn).put(n,i);case 2:return e.n=3,o.done;case 3:return e.a(2,n)}},e)}))).apply(this,arguments)}function bn(e){return wn.apply(this,arguments)}function wn(){return(wn=s(r().m(function e(t){var n,i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return n=kn(t),e.n=1,dn();case 1:return i=e.v,a=i.transaction(pn,"readwrite"),e.n=2,a.objectStore(pn).delete(n);case 2:return e.n=3,a.done;case 3:return e.a(2)}},e)}))).apply(this,arguments)}function kn(e){return e.appConfig.appId}
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Sn=(n(n(n(n(n(n(n(n(n(n(l={},"missing-app-config-values",'Missing App configuration value: "{$valueName}"'),"only-available-in-window","This method is available in a Window context."),"only-available-in-sw","This method is available in a service worker context."),"permission-default","The notification permission was not granted and dismissed instead."),"permission-blocked","The notification permission was not granted and blocked instead."),"unsupported-browser","This browser doesn't support the API's required to use the Firebase SDK."),"indexed-db-unsupported","This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)"),"failed-service-worker-registration","We are unable to register the default service worker. {$browserErrorMessage}"),"token-subscribe-failed","A problem occurred while subscribing the user to FCM: {$errorInfo}"),"token-subscribe-no-token","FCM returned no token when subscribing the user to push."),n(n(n(n(n(n(n(n(l,"token-unsubscribe-failed","A problem occurred while unsubscribing the user from FCM: {$errorInfo}"),"token-update-failed","A problem occurred while updating the user from FCM: {$errorInfo}"),"token-update-no-token","FCM returned no token when updating the user to push."),"use-sw-after-get-token","The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used."),"invalid-sw-registration","The input to useServiceWorker() must be a ServiceWorkerRegistration."),"invalid-bg-handler","The input to setBackgroundMessageHandler() must be a function."),"invalid-vapid-key","The public VAPID key must be a string."),"use-vapid-key-after-get-token","The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used.")),In=new j("messaging","Messaging",Sn);
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function En(e,t){return _n.apply(this,arguments)}function _n(){return(_n=s(r().m(function e(t,n){var i,a,o,s,c,u,f;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.n=1,Pn(t);case 1:return i=e.v,a=Nn(n),o={method:"POST",headers:i,body:JSON.stringify(a)},e.p=2,e.n=3,fetch(An(t.appConfig),o);case 3:return c=e.v,e.n=4,c.json();case 4:s=e.v,e.n=6;break;case 5:throw e.p=5,f=e.v,In.create("token-subscribe-failed",{errorInfo:null==f?void 0:f.toString()});case 6:if(!s.error){e.n=7;break}throw u=s.error.message,In.create("token-subscribe-failed",{errorInfo:u});case 7:if(s.token){e.n=8;break}throw In.create("token-subscribe-no-token");case 8:return e.a(2,s.token)}},e,null,[[2,5]])}))).apply(this,arguments)}function Cn(e,t){return Dn.apply(this,arguments)}function Dn(){return(Dn=s(r().m(function e(t,n){var i,a,o,s,c,u,f;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.n=1,Pn(t);case 1:return i=e.v,a=Nn(n.subscriptionOptions),o={method:"PATCH",headers:i,body:JSON.stringify(a)},e.p=2,e.n=3,fetch("".concat(An(t.appConfig),"/").concat(n.token),o);case 3:return c=e.v,e.n=4,c.json();case 4:s=e.v,e.n=6;break;case 5:throw e.p=5,f=e.v,In.create("token-update-failed",{errorInfo:null==f?void 0:f.toString()});case 6:if(!s.error){e.n=7;break}throw u=s.error.message,In.create("token-update-failed",{errorInfo:u});case 7:if(s.token){e.n=8;break}throw In.create("token-update-no-token");case 8:return e.a(2,s.token)}},e,null,[[2,5]])}))).apply(this,arguments)}function Tn(e,t){return On.apply(this,arguments)}function On(){return(On=s(r().m(function e(t,n){var i,a,o,s,c,u;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.n=1,Pn(t);case 1:return i=e.v,a={method:"DELETE",headers:i},e.p=2,e.n=3,fetch("".concat(An(t.appConfig),"/").concat(n),a);case 3:return o=e.v,e.n=4,o.json();case 4:if(!(s=e.v).error){e.n=5;break}throw c=s.error.message,In.create("token-unsubscribe-failed",{errorInfo:c});case 5:e.n=7;break;case 6:throw e.p=6,u=e.v,In.create("token-unsubscribe-failed",{errorInfo:null==u?void 0:u.toString()});case 7:return e.a(2)}},e,null,[[2,6]])}))).apply(this,arguments)}function An(e){var t=e.projectId;return"".concat("https://fcmregistrations.googleapis.com/v1","/projects/").concat(t,"/registrations")}function Pn(e){return jn.apply(this,arguments)}function jn(){return(jn=s(r().m(function e(t){var n,i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return n=t.appConfig,i=t.installations,e.n=1,i.getToken();case 1:return a=e.v,e.a(2,new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":n.apiKey,"x-goog-firebase-installations-auth":"FIS ".concat(a)}))}},e)}))).apply(this,arguments)}function Nn(e){var t=e.p256dh,n=e.auth,r=e.endpoint,i=e.vapidKey,a={web:{endpoint:r,auth:n,p256dh:t}};return i!==nn&&(a.web.applicationPubKey=i),a}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Mn(e){return Bn.apply(this,arguments)}function Bn(){return(Bn=s(r().m(function e(t){var n,i,a,o;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.n=1,Kn(t.swRegistration,t.vapidKey);case 1:return n=e.v,i={vapidKey:t.vapidKey,swScope:t.swRegistration.scope,endpoint:n.endpoint,auth:an(n.getKey("auth")),p256dh:an(n.getKey("p256dh"))},e.n=2,vn(t.firebaseDependencies);case 2:if(a=e.v){e.n=3;break}return e.a(2,xn(t.firebaseDependencies,i));case 3:if(Wn(a.subscriptionOptions,i)){e.n=8;break}return e.p=4,e.n=5,Tn(t.firebaseDependencies,a.token);case 5:e.n=7;break;case 6:e.p=6,o=e.v,console.warn(o);case 7:return e.a(2,xn(t.firebaseDependencies,i));case 8:if(!(Date.now()>=a.createTime+6048e5)){e.n=9;break}return e.a(2,Fn(t,{token:a.token,createTime:Date.now(),subscriptionOptions:i}));case 9:return e.a(2,a.token);case 10:return e.a(2)}},e,null,[[4,6]])}))).apply(this,arguments)}function Rn(e){return Ln.apply(this,arguments)}function Ln(){return(Ln=s(r().m(function e(t){var n,i;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,vn(t.firebaseDependencies);case 1:if(!(n=e.v)){e.n=3;break}return e.n=2,Tn(t.firebaseDependencies,n.token);case 2:return e.n=3,bn(t.firebaseDependencies);case 3:return e.n=4,t.swRegistration.pushManager.getSubscription();case 4:if(!(i=e.v)){e.n=5;break}return e.a(2,i.unsubscribe());case 5:return e.a(2,!0)}},e)}))).apply(this,arguments)}function Fn(e,t){return Hn.apply(this,arguments)}function Hn(){return(Hn=s(r().m(function e(n,i){var a,o;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,Cn(n.firebaseDependencies,i);case 1:return a=e.v,o=t(t({},i),{},{token:a,createTime:Date.now()}),e.n=2,yn(n.firebaseDependencies,o);case 2:return e.a(2,a);case 3:throw e.p=3,e.v;case 4:return e.a(2)}},e,null,[[0,3]])}))).apply(this,arguments)}function xn(e,t){return Vn.apply(this,arguments)}function Vn(){return(Vn=s(r().m(function e(t,n){var i,a;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,En(t,n);case 1:return i=e.v,a={token:i,createTime:Date.now(),subscriptionOptions:n},e.n=2,yn(t,a);case 2:return e.a(2,a.token)}},e)}))).apply(this,arguments)}function Kn(e,t){return Un.apply(this,arguments)}function Un(){return(Un=s(r().m(function e(t,n){var i;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,t.pushManager.getSubscription();case 1:if(!(i=e.v)){e.n=2;break}return e.a(2,i);case 2:return e.a(2,t.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:on(n)}))}},e)}))).apply(this,arguments)}function Wn(e,t){var n=t.vapidKey===e.vapidKey,r=t.endpoint===e.endpoint,i=t.auth===e.auth,a=t.p256dh===e.p256dh;return n&&r&&i&&a}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function zn(e){var t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return function(e,t){if(!t.notification)return;e.notification={};var n=t.notification.title;n&&(e.notification.title=n);var r=t.notification.body;r&&(e.notification.body=r);var i=t.notification.image;i&&(e.notification.image=i);var a=t.notification.icon;a&&(e.notification.icon=a)}(t,e),function(e,t){if(!t.data)return;e.data=t.data}(t,e),function(e,t){var n,r,i,a,o;if(!(t.fcmOptions||null!==(n=t.notification)&&void 0!==n&&n.click_action))return;e.fcmOptions={};var s=null!==(r=null===(i=t.fcmOptions)||void 0===i?void 0:i.link)&&void 0!==r?r:null===(a=t.notification)||void 0===a?void 0:a.click_action;s&&(e.fcmOptions.link=s);var c=null===(o=t.fcmOptions)||void 0===o?void 0:o.analytics_label;c&&(e.fcmOptions.analyticsLabel=c)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */(t,e),t}function qn(e){return"object"===p(e)&&!!e&&rn in e}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function $n(e){return In.create("missing-app-config-values",{valueName:e})}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */var Gn=function(){return d(function e(t,n,r){g(this,e),this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;var i=function(e){if(!e||!e.options)throw $n("App Configuration Object");if(!e.name)throw $n("App Name");for(var t=e.options,n=0,r=["projectId","apiKey","appId","messagingSenderId"];n<r.length;n++){var i=r[n];if(!t[i])throw $n(i)}return{appName:e.name,projectId:t.projectId,apiKey:t.apiKey,appId:t.appId,senderId:t.messagingSenderId}}(t);this.firebaseDependencies={app:t,appConfig:i,installations:n,analyticsProvider:r}},[{key:"_delete",value:function(){return Promise.resolve()}}])}();
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Jn(e){return Yn.apply(this,arguments)}function Yn(){return(Yn=s(r().m(function e(t){var n;return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,navigator.serviceWorker.register("/firebase-messaging-sw.js",{scope:"/firebase-cloud-messaging-push-scope"});case 1:return t.swRegistration=e.v,t.swRegistration.update().catch(function(){}),e.n=2,Qn(t.swRegistration);case 2:e.n=4;break;case 3:throw e.p=3,n=e.v,In.create("failed-service-worker-registration",{browserErrorMessage:null==n?void 0:n.message});case 4:return e.a(2)}},e,null,[[0,3]])}))).apply(this,arguments)}function Qn(e){return Xn.apply(this,arguments)}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function Xn(){return(Xn=s(r().m(function e(t){return r().w(function(e){for(;;)if(0===e.n)return e.a(2,new Promise(function(e,n){var r=setTimeout(function(){return n(new Error("Service worker not registered after ".concat(1e4," ms")))},1e4),i=t.installing||t.waiting;t.active?(clearTimeout(r),e()):i?i.onstatechange=function(t){var n;"activated"===(null===(n=t.target)||void 0===n?void 0:n.state)&&(i.onstatechange=null,clearTimeout(r),e())}:(clearTimeout(r),n(new Error("No incoming service worker found.")))}))},e)}))).apply(this,arguments)}function Zn(e,t){return er.apply(this,arguments)}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function er(){return(er=s(r().m(function e(t,n){return r().w(function(e){for(;;)switch(e.n){case 0:if(n||t.swRegistration){e.n=1;break}return e.n=1,Jn(t);case 1:if(n||!t.swRegistration){e.n=2;break}return e.a(2);case 2:if(n instanceof ServiceWorkerRegistration){e.n=3;break}throw In.create("invalid-sw-registration");case 3:t.swRegistration=n;case 4:return e.a(2)}},e)}))).apply(this,arguments)}function tr(e,t){return nr.apply(this,arguments)}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function nr(){return(nr=s(r().m(function e(t,n){return r().w(function(e){for(;;)switch(e.n){case 0:n?t.vapidKey=n:t.vapidKey||(t.vapidKey=nn);case 1:return e.a(2)}},e)}))).apply(this,arguments)}function rr(e,t){return ir.apply(this,arguments)}
/**
             * @license
             * Copyright 2019 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function ir(){return(ir=s(r().m(function e(t,n){return r().w(function(e){for(;;)switch(e.n){case 0:if(navigator){e.n=1;break}throw In.create("only-available-in-window");case 1:if("default"!==Notification.permission){e.n=2;break}return e.n=2,Notification.requestPermission();case 2:if("granted"===Notification.permission){e.n=3;break}throw In.create("permission-blocked");case 3:return e.n=4,tr(t,null==n?void 0:n.vapidKey);case 4:return e.n=5,Zn(t,null==n?void 0:n.serviceWorkerRegistration);case 5:return e.a(2,Mn(t))}},e)}))).apply(this,arguments)}function ar(e,t,n){return or.apply(this,arguments)}function or(){return(or=s(r().m(function e(t,n,i){var a;return r().w(function(e){for(;;)switch(e.n){case 0:return a=sr(n),e.n=1,t.firebaseDependencies.analyticsProvider.get();case 1:e.v.logEvent(a,{message_id:i[rn],message_name:i["google.c.a.c_l"],message_time:i["google.c.a.ts"],message_device_time:Math.floor(Date.now()/1e3)});case 2:return e.a(2)}},e)}))).apply(this,arguments)}function sr(e){switch(e){case tn.NOTIFICATION_CLICKED:return"notification_open";case tn.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function cr(){return(cr=s(r().m(function e(t,n){var i,a;return r().w(function(e){for(;;)switch(e.n){case 0:if((i=n.data).isFirebaseMessaging){e.n=1;break}return e.a(2);case 1:if(t.onMessageHandler&&i.messageType===tn.PUSH_RECEIVED&&("function"==typeof t.onMessageHandler?t.onMessageHandler(zn(i)):t.onMessageHandler.next(zn(i))),!qn(a=i.data)||"1"!==a["google.c.a.e"]){e.n=2;break}return e.n=2,ar(t,i.messageType,a);case 2:return e.a(2)}},e)}))).apply(this,arguments)}var ur="@firebase/messaging",fr="0.12.25",lr=function(e){var t=new Gn(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",function(e){return function(e,t){return cr.apply(this,arguments)}(t,e)}),t},pr=function(e){var t=e.getProvider("messaging").getImmediate();return{getToken:function(e){return rr(t,e)}}};
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function hr(){return dr.apply(this,arguments)}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */function dr(){return(dr=s(r().m(function e(){return r().w(function(e){for(;;)switch(e.p=e.n){case 0:return e.p=0,e.n=1,O();case 1:e.n=3;break;case 2:return e.p=2,e.v,e.a(2,!1);case 3:return e.a(2,"undefined"!=typeof window&&T()&&A()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey"))}},e,null,[[0,2]])}))).apply(this,arguments)}
/**
             * @license
             * Copyright 2020 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function vr(){return(vr=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:if(navigator){e.n=1;break}throw In.create("only-available-in-window");case 1:if(t.swRegistration){e.n=2;break}return e.n=2,Jn(t);case 2:return e.a(2,Rn(t))}},e)}))).apply(this,arguments)}
/**
             * @license
             * Copyright 2017 Google LLC
             *
             * Licensed under the Apache License, Version 2.0 (the "License");
             * you may not use this file except in compliance with the License.
             * You may obtain a copy of the License at
             *
             *   http://www.apache.org/licenses/LICENSE-2.0
             *
             * Unless required by applicable law or agreed to in writing, software
             * distributed under the License is distributed on an "AS IS" BASIS,
             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
             * See the License for the specific language governing permissions and
             * limitations under the License.
             */
function gr(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:Ce();return hr().then(function(e){if(!e)throw In.create("unsupported-browser")},function(e){throw In.create("indexed-db-unsupported")}),Se(R(e),"messaging").getImmediate()}function yr(e,t){return mr.apply(this,arguments)}function mr(){return(mr=s(r().m(function e(t,n){return r().w(function(e){for(;;)if(0===e.n)return t=R(t),e.a(2,rr(t,n))},e)}))).apply(this,arguments)}function br(e){return function(e){return vr.apply(this,arguments)}(e=R(e))}function wr(e,t){return function(e,t){if(!navigator)throw In.create("only-available-in-window");return e.onMessageHandler=t,function(){e.onMessageHandler=null}}(e=R(e),t)}ke(new L("messaging",lr,"PUBLIC")),ke(new L("messaging-internal",pr,"PRIVATE")),De(ur,fr),De(ur,fr,"esm2020");var kr=function(e){function t(){var e;return g(this,t),e=y(this,t),hr().then(function(t){t&&wr(gr(),function(t){return e.handleNotificationReceived(t)})}),e}return m(t,e),d(t,[{key:"checkPermissions",value:(w=s(r().m(function e(){var t;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,hr();case 1:if(e.v){e.n=2;break}return e.a(2,{receive:"denied"});case 2:return t=this.convertNotificationPermissionToPermissionState(Notification.permission),e.a(2,{receive:t})}},e,this)})),function(){return w.apply(this,arguments)})},{key:"requestPermissions",value:(b=s(r().m(function e(){var t,n;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,hr();case 1:if(e.v){e.n=2;break}return e.a(2,{receive:"denied"});case 2:return e.n=3,Notification.requestPermission();case 3:return t=e.v,n=this.convertNotificationPermissionToPermissionState(t),e.a(2,{receive:n})}},e,this)})),function(){return b.apply(this,arguments)})},{key:"isSupported",value:(v=s(r().m(function e(){var t;return r().w(function(e){for(;;)switch(e.n){case 0:return e.n=1,hr();case 1:return t=e.v,e.a(2,{isSupported:t})}},e)})),function(){return v.apply(this,arguments)})},{key:"getToken",value:(h=s(r().m(function e(t){var n,i;return r().w(function(e){for(;;)switch(e.n){case 0:return n=gr(),e.n=1,yr(n,{vapidKey:t.vapidKey,serviceWorkerRegistration:t.serviceWorkerRegistration});case 1:return i=e.v,e.a(2,{token:i})}},e)})),function(e){return h.apply(this,arguments)})},{key:"deleteToken",value:(p=s(r().m(function e(){var t;return r().w(function(e){for(;;)switch(e.n){case 0:return t=gr(),e.n=1,br(t);case 1:return e.a(2)}},e)})),function(){return p.apply(this,arguments)})},{key:"getDeliveredNotifications",value:(l=s(r().m(function e(){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(){return l.apply(this,arguments)})},{key:"removeDeliveredNotifications",value:(f=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(e){return f.apply(this,arguments)})},{key:"removeAllDeliveredNotifications",value:(u=s(r().m(function e(){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(){return u.apply(this,arguments)})},{key:"subscribeToTopic",value:(c=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(e){return c.apply(this,arguments)})},{key:"unsubscribeFromTopic",value:(o=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(e){return o.apply(this,arguments)})},{key:"createChannel",value:(a=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(e){return a.apply(this,arguments)})},{key:"deleteChannel",value:(i=s(r().m(function e(t){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(e){return i.apply(this,arguments)})},{key:"listChannels",value:(n=s(r().m(function e(){return r().w(function(e){for(;;)switch(e.n){case 0:this.throwUnimplementedError();case 1:return e.a(2)}},e,this)})),function(){return n.apply(this,arguments)})},{key:"handleNotificationReceived",value:function(e){var n={notification:this.createNotificationResult(e)};this.notifyListeners(t.notificationReceivedEvent,n)}},{key:"createNotificationResult",value:function(e){var t,n,r;return{body:null===(t=e.notification)||void 0===t?void 0:t.body,data:e.data,id:e.messageId,image:null===(n=e.notification)||void 0===n?void 0:n.image,title:null===(r=e.notification)||void 0===r?void 0:r.title}}},{key:"convertNotificationPermissionToPermissionState",value:function(e){var t="prompt";switch(e){case"granted":t="granted";break;case"denied":t="denied"}return t}},{key:"throwUnimplementedError",value:function(){throw this.unimplemented("Not implemented on web.")}}]);var n,i,a,o,c,u,f,l,p,h,v,b,w}(o);e("FirebaseMessagingWeb",kr),kr.notificationReceivedEvent="notificationReceived"}}})}();

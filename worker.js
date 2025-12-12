// NOT MY SOURCE CODE!

/* eslint-disable no-eval */
/* eslint-disable default-param-last */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
// importScripts('https://unpkg.com/comlink/dist/umd/comlink.js');

importScripts('./comlink.js');
importScripts('./glue.js');

var wasmPrivModules;
let apiUrl;
let sesstionToken;
let publicKey;
let debugType;
let inputPtr;
let imageInputSize;
let barCodePtr;
// Retain privid_wasm_result as it is used/assigned elsewhere
let privid_wasm_result = null;
// privid_wasm_error moved to global scope
let wasmSession = null;
let setCache = true;
let checkWasmLoaded = false;
let antispoofVersion;
const ModuleName = 'ultra';
const cdnUrl = 'https://ultra-wasm.devel.privateid.com'; // Devel
// const cdnUrl = 'https://ultra-wasm.privateid.com/wasm'; // Prod
let useCdnLink = true;

// Define global callbacks for WASM
self.privid_wasm_progress = (type, message, value) => {
  // console.log(`WASM PROGRESS: ${type} ${message} ${value}`);
};

self.privid_wasm_error = (code, message) => {
  console.error(`WASM ERROR: ${code} ${message}`);
};

const createImageArguments = (imageData, width, height) => { };

const createStringArguments = () => { };

const printLogs = (message, data, type = 'LOG') => {
  console.log('FROM_SDK_WORKER', message, data);
  const errorLogs = ['1', '2', '3', '901', '902', '903'];
  const warningLogs = ['2', '3', '902', '903'];
  const allLogs = ['3', '903'];

  if (type === 'ERROR' && errorLogs.includes('3')) {
    console.error('DEBUG_SDK_WASM_WORKER', message, data);
  } else if (type === 'WARN' && warningLogs.includes('3')) {
    console.warn('DEBUG_SDK_WASM_WORKER', message, data);
  } else if (type === 'LOG' && allLogs.includes('3')) {
    console.log('DEBUG_SDK_WASM_WORKER', message, data);
  }
};

const isLoad = (
  simd,
  url,
  session_token,
  public_key,
  debug_type,
  cacheConfig = true,
  timeout = 5000,
  useCdn = false,
  shouldRegenerateSession,
  failureCb,
  usageScenario,
  cache_content,
) =>
  new Promise(async (resolve, reject) => {
    apiUrl = url;
    sesstionToken = session_token;
    publicKey = public_key;
    useCdnLink = useCdn;
    privid_wasm_error = failureCb;
    if (debug_type) {
      debugType = debug_type;
    }
    let timeoutSession = 5000;
    if (timeout) {
      timeoutSession = timeout;
    }
    setCache = cacheConfig;

    printLogs(`data: `, { simd, url, session_token, public_key, debug_type, cache_content });

    const modulePath = simd ? 'simd' : 'nosimd';
    const moduleName = 'privid_fhe_uber';
    const cachedModule = await readKey(ModuleName);
    // const fetchdVersion = await fetchdWasmVersion.json();
    const fetchdWasmVersion = { version: "25.12.03-beab721" }; // POC PATCH: Hardcoded version OR fetch('./version.json')
    // const fetchdWasmVersion = await (await fetch(`../wasm/${ModuleName}/${modulePath}/version.json`)).json();

    printLogs(
      `versions: cached:
        ${cachedModule ? cachedModule?.version.toString() : 'no cached wasm'}, 
        fetched:
        ${fetchdWasmVersion ? fetchdWasmVersion.version.toString() : 'no fetched version'})
        modulePath: ${modulePath}`,
      '',
    );

    const loadFromPackage = async () => {
      printLogs(`fetched version: `, fetchdWasmVersion);
      wasmPrivModules = await loadWasmModule(modulePath, moduleName, true, `${fetchdWasmVersion.version}`);
      printLogs(`ULTRA MODULE: `, wasmPrivModules);
      if (!checkWasmLoaded) {
        await initializeWasmSession(
          url,
          sesstionToken,
          publicKey,
          debugType,
          timeoutSession,
          usageScenario,
          cache_content,
        );
        checkWasmLoaded = true;
      }
      resolve('Loaded');
    };

    if (
      cachedModule &&
      cachedModule.version &&
      fetchdWasmVersion &&
      fetchdWasmVersion.version &&
      cachedModule.version.toString() === fetchdWasmVersion?.version.toString()
    ) {
      printLogs(`same version confirmed`, '');
      printLogs(`PRIVMODULES LOADED?: `, wasmPrivModules);
      if (!wasmPrivModules) {
        const { cachedWasm, cachedScript } = cachedModule;

        if (cachedWasm && cachedScript) {
          eval(cachedScript);
          wasmPrivModules = await createTFLiteModule({ wasmBinary: cachedWasm });
          printLogs(`ULTRA MODULE `, wasmPrivModules);
          if (!checkWasmLoaded) {
            await initializeWasmSession(
              url,
              sesstionToken,
              publicKey,
              debugType,
              timeoutSession,
              usageScenario,
              cache_content,
            );
            checkWasmLoaded = true;
          }
          printLogs(`WASM MODULES: `, wasmPrivModules);
        } else {
          await loadFromPackage();
        }
      } else if (wasmPrivModules && shouldRegenerateSession) {
        wasmSession = null;
        await initializeWasmSession(
          url,
          sesstionToken,
          publicKey,
          debugType,
          timeoutSession,
          usageScenario,
          cache_content,
        );
      } else {
        await loadFromPackage();
      }
      resolve('Cache Loaded');
    } else {
      await loadFromPackage();
    }
  });

function flatten(arrays, TypedArray) {
  const arr = new TypedArray(arrays.reduce((n, a) => n + a.length, 0));
  let i = 0;
  arrays.forEach((a) => {
    arr.set(a, i);
    i += a.length;
  });
  return arr;
}

const ultraEnroll = async (imageData, simd, config, cb) => {
  privid_wasm_result = cb;

  if (!wasmPrivModules) {
    await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
  }

  const imageInputSize = imageData.data.length * imageData.data.BYTES_PER_ELEMENT;
  const imageInputPtr = wasmPrivModules._malloc(imageInputSize);
  wasmPrivModules.HEAPU8.set(new Uint8Array(imageData.data), imageInputPtr);
  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  const encoder = new TextEncoder();
  const config_bytes = encoder.encode(`${config}`);
  const configInputSize = config_bytes.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);
  const bestImageFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  const bestImageLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);
  printLogs(`config: `, config);
  try {
    wasmPrivModules._privid_user_enroll(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      imageInputPtr /* input images */,
      imageData.width /* width of one image */,
      imageData.height /* height of one image */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }

  // let bestImage = null;

  // const [outputBufferSize] = new Uint32Array(wasmPrivModules.HEAPU8.buffer, bestImageLenPtr, 1);

  // if (outputBufferSize > 0) {
  //   let outputBufferSecPtr = null;
  //   [outputBufferSecPtr] = new Uint32Array(wasmPrivModules.HEAPU8.buffer, bestImageFirstPtr, 1);
  //   const outputBufferPtr = new Uint8Array(wasmPrivModules.HEAPU8.buffer, outputBufferSecPtr, outputBufferSize);
  //   const outputBuffer = Uint8ClampedArray.from(outputBufferPtr);
  //   const outputBufferData = outputBufferSize > 0 ? outputBuffer : null;
  //   bestImage = { imageData: outputBufferData, width: imageData.width, height: imageData.height };
  //   wasmPrivModules._free(outputBufferPtr);
  // }

  wasmPrivModules._free(imageInputPtr);
  wasmPrivModules._free(resultFirstPtr);
  wasmPrivModules._free(resultLenPtr);
  wasmPrivModules._free(configInputPtr);
  wasmPrivModules._free(bestImageFirstPtr);
  wasmPrivModules._free(bestImageLenPtr);
  // return bestImage;
};

const ultraAgeEstimate = async (originalImages, simd, config, cb) => {
  privid_wasm_result = cb;
  if (!wasmPrivModules) {
    await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
  }
  const imageInput = flatten(
    originalImages.map((x) => x.data),
    Uint8Array,
  );
  const encoder = new TextEncoder();
  const config_bytes = encoder.encode(`${config}`);
  const configInputSize = config.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);
  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);
  const imageInputSize = imageInput.length * imageInput.BYTES_PER_ELEMENT;
  const imageInputPtr = wasmPrivModules._malloc(imageInputSize);

  wasmPrivModules.HEAP8.set(imageInput, imageInputPtr / imageInput.BYTES_PER_ELEMENT);
  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);

  // create a pointer to interger to hold the length of the output buffer
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  printLogs(`Config: `, config);
  try {
    await wasmPrivModules._privid_estimate_age(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      imageInputPtr /* input images */,
      originalImages[0].width /* width of one image */,
      originalImages[0].height /* height of one image */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }
  wasmPrivModules._free(imageInputPtr);
  wasmPrivModules._free(configInputPtr);
  wasmPrivModules._free(resultFirstPtr);
  wasmPrivModules._free(resultLenPtr);
};

const ultraPredict = async (originalImages, simd, config, cb) => {
  privid_wasm_result = cb;
  if (!wasmPrivModules) {
    await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
  }

  const numImages = originalImages.length;
  const imageInput = flatten(
    originalImages.map((x) => x.data),
    Uint8Array,
  );
  // const version = wasmPrivModules._get_version();

  const encoder = new TextEncoder();
  const config_bytes = encoder.encode(`${config}`);

  const configInputSize = config.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);
  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

  const imageInputSize = imageInput.length * imageInput.BYTES_PER_ELEMENT;
  const imageInputPtr = wasmPrivModules._malloc(imageInputSize);

  wasmPrivModules.HEAP8.set(imageInput, imageInputPtr / imageInput.BYTES_PER_ELEMENT);

  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  // create a pointer to interger to hold the length of the output buffer
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  printLogs(`Config:`, config);

  try {
    await wasmPrivModules._privid_user_predict(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      imageInputPtr /* input images */,
      originalImages[0].width /* width of one image */,
      originalImages[0].height /* height of one image */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }

  wasmPrivModules._free(imageInputPtr);
  wasmPrivModules._free(configInputPtr);
  wasmPrivModules._free(resultFirstPtr);
  wasmPrivModules._free(resultLenPtr);
};

function readKey(key) {
  if (!indexedDB) return Promise.reject(new Error('IndexedDB not available'));

  return new Promise((resolve, reject) => {
    const open = indexedDB.open('/privid-wasm', 21);

    open.onerror = function () {
      resolve(false);
    };

    open.onupgradeneeded = function () {
      open.result.createObjectStore('/privid-wasm');
    };

    open.onsuccess = function () {
      const db = open.result;
      const tx = db.transaction('/privid-wasm', 'readwrite');
      const store = tx.objectStore('/privid-wasm');
      const getKey = store.get(key);

      getKey.onsuccess = function () {
        resolve(getKey.result);
      };

      tx.onerror = function () {
        reject(tx.error);
      };

      tx.oncomplete = function () {
        try {
          db.close();
        } catch (e) {
          //
          printLogs(`Error readKey: `, e, 'ERROR');
        }
      };
    };
  });
}

function putKey(key, cachedWasm, cachedScript, version) {
  if (!indexedDB) return Promise.reject(new Error('IndexedDB not available'));

  return new Promise((resolve, reject) => {
    const open = indexedDB.open('/privid-wasm', 21);

    open.onerror = function () {
      resolve(false);
    };

    open.onupgradeneeded = function () {
      open.result.createObjectStore('/privid-wasm');
    };

    open.onsuccess = function () {
      const db = open.result;
      const tx = db.transaction('/privid-wasm', 'readwrite');
      const store = tx.objectStore('/privid-wasm');
      const getKey = store.put({ cachedWasm, cachedScript, version }, key);

      getKey.onsuccess = function () {
        resolve('saved');
      };

      tx.onerror = function () {
        reject(tx.error);
      };

      tx.oncomplete = function () {
        try {
          db.close();
        } catch (e) {
          //
          printLogs(`Error putKey: `, e, 'ERROR');
        }
      };
    };
  });
}

// async function setCacheConfiguration() {
//   const db = indexedDB.open('test');
//   db.onerror = function () {
//     printLogs(`Private browser no cache`, '');
//   };
//   db.onsuccess = async function () {
//     const cacheObj = JSON.stringify({ cache_type: setCache ? 'basic' : 'nocache' });
//     const encoder = new TextEncoder();
//     const cache_config_bytes = encoder.encode(`${cacheObj}`);

//     const cacheInputSize = cacheObj.length;
//     const cacheInputPtr = wasmPrivModules._malloc(cacheInputSize);

//     wasmPrivModules.HEAP8.set(cache_config_bytes, cacheInputPtr / cache_config_bytes.BYTES_PER_ELEMENT);
//     await wasmPrivModules._privid_set_configuration(wasmSession, cacheInputPtr, cacheInputSize);
//     wasmPrivModules._free(cacheInputPtr);
//   };
// }

/**
 * @brief A closure to create a string buffer arguments that can be used with wasm calls
 * for a given javascript value.
 * This is suitable for native calls that have string input arguments represented with contigious
 * string_buffer,sizeofbuffer arguments.
 * If the 'text' argument is null or undefined or NaN then the arguments generated  are [null,0]
 * @usage
 *
 var url_args= buffer_args(url);
 var key_args= buffer_args(key);
 var session_out_ptr = output_ptr();
 const s_result = wasmPrivModules._privid_initialize_session(
      ...key_args.args(),
      ...url_args.args(),
      debug_type,
      session_out_ptr.outer_ptr(),
    );
    url_args.free();
    key_args.free();
    //get
    var session = session_out_ptr.inner_ptr();
 *
 *  when .free() is called the closure can be reused to create a buffer for the same string with which, it was created with
 *  over and over again.
 */
const buffer_args = function (text) {
  let strInputtPtr = null;
  let strInputSize = 0;
  let argsv = [];
  return {
    args: () => {
      do {
        if (argsv.length > 0) break;
        argsv = [null, 0];
        if (text === null) break;
        if (text === undefined) break;
        // eslint-disable-next-line use-isnan
        if (text === NaN) break;
        const str = `${text}`;
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        strInputSize = bytes.length * bytes.BYTES_PER_ELEMENT;
        strInputtPtr = wasmPrivModules._malloc(strInputSize);
        wasmPrivModules.HEAP8.set(bytes, strInputtPtr / bytes.BYTES_PER_ELEMENT);
        argsv = [strInputtPtr, strInputSize];
      } while (false);
      return argsv;
    },
    free: () => {
      if (strInputtPtr) {
        wasmPrivModules._free(strInputtPtr);
        strInputtPtr = null;
        strInputSize = 0;
        argsv = [];
      }
    },
  };
};

/**
 * @brief A closure to create an output 32bits pointer closure.
 * This is usefull for allocating a native address and pass it to the
 * 'wasmPrivModules' so it can return in the address of a buffer (or an object like session)
 * that was allocated inside the wasm. This typically, correspond to
 * an argument of type void** (marked output argument) to pass to a native wasm
 * call.
 * @usage var myoutput_ptr = output_ptr();
 * when passing the output pointer to the 'wasmPrivModules' module use
 * wasmPrivModules.nativecall(myoutput_ptr.outer_ptr());
 * Then pull out the the allocated buffer by the wasm call this way:
 * @code
 * my_buffer_or_structure = myoutput_ptr.inner_ptr();
 * @note It is the responsability of the caller to free the pointer returned by this inner_ptr()
 */
const output_ptr = function () {
  let out_ptr = null;
  let in_ptr = null;
  const free_ptr = (ptr) => {
    if (ptr) {
      wasmPrivModules._free(ptr);
      // eslint-disable-next-line no-param-reassign
      ptr = null;
    }
  };
  return {
    /**
     * @brief  Allocates a pointer to contain the result and return it,
     * if the container is already created it will be returned
     */
    outer_ptr: () => {
      // TODO: may be used SharedArrayBuffer() instead
      // allocate memory the expected pointer (outer pointer or container)
      if (!out_ptr) out_ptr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
      return out_ptr;
    },
    /**
     * @brief Creates a javascript Uint32Array pointer to contain the result pointed by outer_ptr and return it,
     * It is the responsability of the caller to free the pointer returned by this function
     */
    inner_ptr: () => {
      //  If we did not allocate yet the output buffer return null
      if (!out_ptr) return null;
      // if we already have our inner pointer for this closure return it
      if (in_ptr) return in_ptr;
      // Access  the outer pointer as an arry of uint32 which conatin a single cell
      // whose value is the pointer allocated in the wasm module (inner pointer of the output param)
      // and return it
      [in_ptr] = new Uint32Array(wasmPrivModules.HEAPU8.buffer, out_ptr, 1);
      return in_ptr;
    },
  };
};

async function ultraCompareEmbeddings(encryptedEmbeddingsA, encryptedEmbeddingsB, config, cb) {
  try {
    privid_wasm_result = cb;
    if (!wasmPrivModules) {
      await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
    }

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(`${config}`);

    const configInputSize = config.length;
    const configInputPtr = wasmPrivModules._malloc(configInputSize);
    wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

    const embeddingA_bytes = encoder.encode(`${encryptedEmbeddingsA}`);
    const embeddingOneSize = encryptedEmbeddingsA.length;
    const embeddingOnePtr = wasmPrivModules._malloc(embeddingOneSize);
    wasmPrivModules.HEAP8.set(embeddingA_bytes, embeddingOnePtr / embeddingA_bytes.BYTES_PER_ELEMENT);

    const embeddingB_bytes = encoder.encode(`${encryptedEmbeddingsB}`);
    const embeddingTwoSize = encryptedEmbeddingsB.length;
    const embeddingTwoPtr = wasmPrivModules._malloc(embeddingTwoSize);
    wasmPrivModules.HEAP8.set(embeddingB_bytes, embeddingTwoPtr / embeddingB_bytes.BYTES_PER_ELEMENT);

    const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
    // create a pointer to interger to hold the length of the output buffer
    const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);

    const result = await wasmPrivModules._privid_compare_embeddings(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      embeddingOnePtr /* 1st embedding (encrypted string) */,
      embeddingOneSize /* 1st embedding size */,
      embeddingTwoPtr /* 2nd embedding (encrypted string) */,
      embeddingTwoSize /* 2nd embedding size */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );

    wasmPrivModules._free(embeddingOnePtr);
    wasmPrivModules._free(embeddingTwoPtr);
    wasmPrivModules._free(configInputPtr);
    wasmPrivModules._free(resultFirstPtr);
    wasmPrivModules._free(resultLenPtr);

    return result;
  } catch (e) {
    printLogs(`Compare embeddings: `, e, 'ERROR');
  }
}

async function ultraDocumentOcr(imageInput, config, cb) {
  try {
    privid_wasm_result = cb;
    if (!wasmPrivModules) {
      await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
    }

    const encoder = new TextEncoder();
    const config_bytes = encoder.encode(`${config}`);
    const input_Image_bytes = encoder.encode(`${imageInput}`);

    const configInputSize = config.length;
    const configInputPtr = wasmPrivModules._malloc(configInputSize);
    wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

    const imageInputSize = imageInput.length;
    const imageInputPtr = wasmPrivModules._malloc(imageInputSize);

    wasmPrivModules.HEAP8.set(input_Image_bytes, imageInputPtr / input_Image_bytes.BYTES_PER_ELEMENT);

    const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
    // create a pointer to interger to hold the length of the output buffer
    const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
    printLogs(`Document OCR Config: `, config);

    try {
      await wasmPrivModules._privid_doc_ocr_front_enc(
        wasmSession /* session pointer */,
        configInputPtr,
        configInputSize,
        imageInputPtr /* input images */,
        imageInputSize /* size of one image */,
        resultFirstPtr /* operation result output buffer */,
        resultLenPtr /* operation result buffer length */,
      );
    } catch (e) {
      printLogs(`Error: `, e, 'ERROR');
    }

    wasmPrivModules._free(imageInputPtr);
    wasmPrivModules._free(configInputPtr);
    wasmPrivModules._free(resultFirstPtr);
    wasmPrivModules._free(resultLenPtr);
  } catch (e) {
    printLogs(`Compare embeddings: `, e, 'ERROR');
  }
}

async function initializeWasmSession(
  url,
  session_token,
  public_key,
  debug_type,
  timeout = 5000,
  usageScenario,
  cache_content = '',
) {
  if (!wasmSession) {
    printLogs(`initSession: ${url}, ${session_token}, ${public_key} `);
    const session_out_ptr = output_ptr();
    let urlSettings = url;
    if (typeof url === 'string') {
      const baseUrl = url.endsWith('/v2/verification-session') ? url : `${url}/v2/verification-session`;
      urlSettings = {
        collections: {
          default: {
            named_urls: {
              base_url: baseUrl
            }
          }
        }
      };
    }

    const settings = {
      ...urlSettings,
      session_token,
      public_key,
      debug_level: debug_type ? parseInt(debugType) : 0,
      custom_settings: { usage_scenario: usageScenario, cache_content },
    };

    printLogs(`Settings:`, settings);
    const settings_args = buffer_args(JSON.stringify(settings));

    const s_result = wasmPrivModules._privid_initialize_session(...settings_args.args(), session_out_ptr.outer_ptr());
    settings_args.free();

    const isLoadedModels = wasmPrivModules._privid_check_models();

    printLogs(`Loaded Models: `, isLoadedModels);
    if (s_result) {
      printLogs(`Session initialized successfully`, '');
    } else {
      printLogs(`Session initialization Failed`, '', 'ERROR');
      return;
    }

    wasmSession = session_out_ptr.inner_ptr();
    printLogs(`wasm session: `, wasmSession);
    // if (setCache) {
    //   await setCacheConfiguration();
    // }
  }
}

const loadWasmModule = async (modulePath, moduleName, saveCache, version) => {
  // POC PATCH: Simplified Loader
  printLogs(`POC PATCH: Loading target.wasm`, '');

  const wasm = await fetch('./target.wasm');
  const buffer = await wasm.arrayBuffer();

  // Glue is already loaded via importScripts
  const module = await createTFLiteModule({ wasmBinary: buffer });
  printLogs(`Module: `, module);
  if (saveCache) {
    // POC: Skip caching logic or keep it if harmless
    // const version = module.UTF8ToString(module._privid_get_version());
    // await putKey('ultra', buffer, scriptBuffer, version);
  }
  return module;
};

async function fetchResource(cdnUrl, localUrl) {
  try {
    printLogs(`LOADING RESOURCE`, '');
    if (useCdnLink) {
      const response = await fetch(cdnUrl);
      printLogs(`Response: `, response);
      return response;
    } else {
      const response = await fetch(localUrl);
      return response;
    }
  } catch (error) {
    console.error(`Error fetching resource from CDN. Falling back to local path. Error: ${error}`);
    return fetch(localUrl);
  }
}

const pkiEncrypt = async (payload, config = JSON.stringify({})) => {

  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(`${payload}`);
  const payloadInputSize = payloadBytes.length;
  const payloadInputPtr = wasmPrivModules._malloc(payloadInputSize);

  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  // create a pointer to interger to hold the length of the output buffer
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  wasmPrivModules.HEAP8.set(payloadBytes, payloadInputPtr / payloadBytes.BYTES_PER_ELEMENT);
  printLogs(`Payload: `, payload, debugType);
  let res = null;

  const config_bytes = encoder.encode(`${config}`);

  const configInputSize = config.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);
  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

  try {
    res = wasmPrivModules._privid_encrypt_payload(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      payloadInputPtr,
      payloadInputSize,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }

  printLogs(`Result: `, res);

  const [outputBufferSizes] = new Uint32Array(wasmPrivModules.HEAPU8.buffer, resultLenPtr, 1);

  if (outputBufferSizes > 0) {
    // de-reference & copy the data from pointer to integer in integer array of one element
    const outputBufferSize = new Uint32Array(wasmPrivModules.HEAPU8.buffer, resultLenPtr, 1)[0];
    const outputBufferSecPtr = new Uint32Array(wasmPrivModules.HEAPU8.buffer, resultFirstPtr, 1)[0];
    const outputBufferPtr = new Uint8Array(wasmPrivModules.HEAPU8.buffer, outputBufferSecPtr, outputBufferSize);

    var decoder = new TextDecoder('utf8');
    var dec = decoder.decode(outputBufferPtr);
    dec.replace(/\0/g, '');
    dec.replace(' ', '');
    function removeNullBytes(str) {
      return str
        .split('')
        .filter((char) => char.codePointAt(0))
        .join('');
    }
    let parsedDec = JSON.stringify(removeNullBytes(dec));
    printLogs(`Parsed: `, parsedDec);
    let isObject = JSON.parse(parsedDec);
    printLogs(`Is object? `, isObject);
    return JSON.parse(isObject);
  }

  return { error: true };
};

const ultraScanFrontDocument = async (imageInput, simd, config, cb) => {
  privid_wasm_result = cb;
  if (!wasmPrivModules) {
    await isLoad(simd, apiUrl, sesstionToken, publicKey);
  }

  const encoder = new TextEncoder();
  const config_bytes = encoder.encode(`${config}`);

  const configInputSize = config.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);
  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

  const imageInputSize = imageInput.data.length * imageInput.data.BYTES_PER_ELEMENT;
  const imageInputPtr = wasmPrivModules._malloc(imageInputSize);
  wasmPrivModules.HEAPU8.set(new Uint8Array(imageInput.data), imageInputPtr);

  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  printLogs(`Config: `, {
    wasmSession /* session pointer */,
    configInputPtr,
    configInputSize,
    imageInputPtr /* input images */,
    width: imageInput.width /* width of one image */,
    height: imageInput.height /* height of one image */,
    resultFirstPtr /* operation result output buffer */,
    resultLenPtr,
  });

  try {
    await wasmPrivModules._privid_doc_scan_front(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      imageInputPtr /* input images */,
      imageInput.width /* width of one image */,
      imageInput.height /* height of one image */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }

  wasmPrivModules._free(imageInputPtr);
  wasmPrivModules._free(configInputPtr);
  wasmPrivModules._free(resultFirstPtr);
  wasmPrivModules._free(resultLenPtr);
};

const ultraScanBackDocument = async (imageInput, simd, config, cb) => {
  privid_wasm_result = cb;
  if (!wasmPrivModules) {
    await isLoad(simd, apiUrl, sesstionToken, publicKey, debugType);
  }

  printLogs(`Extra config: `, config);
  const encoder = new TextEncoder();
  const config_bytes = encoder.encode(`${config}`);

  const configInputSize = config.length;
  const configInputPtr = wasmPrivModules._malloc(configInputSize);

  wasmPrivModules.HEAP8.set(config_bytes, configInputPtr / config_bytes.BYTES_PER_ELEMENT);

  printLogs(`Image Input `, imageInput);
  const imageInputSize = imageInput?.data?.length * imageInput?.data?.BYTES_PER_ELEMENT;
  const imageInputPtr = wasmPrivModules._malloc(imageInputSize);
  printLogs(`Input image Size:`, imageInputSize);
  wasmPrivModules.HEAPU8.set(new Uint8Array(imageInput.data), imageInputPtr);
  // wasmPrivModules.HEAP8.set(imageInput, imageInputPtr / imageInput?.data?.BYTES_PER_ELEMENT);

  const resultFirstPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  // create a pointer to interger to hold the length of the output buffer
  const resultLenPtr = wasmPrivModules._malloc(Int32Array.BYTES_PER_ELEMENT);
  printLogs(`Config:  `, {
    configInputPtr,
    configInputSize,
    imageInputPtr /* input images */,
    width: imageInput.width /* width of one image */,
    height: imageInput.height /* height of one image */,
    resultFirstPtr /* operation result output buffer */,
    resultLenPtr /* operation result buffer length */,
  });

  try {
    await wasmPrivModules._privid_doc_scan_back(
      wasmSession /* session pointer */,
      configInputPtr,
      configInputSize,
      imageInputPtr /* input images */,
      imageInput.width /* width of one image */,
      imageInput.height /* height of one image */,
      resultFirstPtr /* operation result output buffer */,
      resultLenPtr /* operation result buffer length */,
    );
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
  }

  wasmPrivModules._free(imageInputPtr);
  wasmPrivModules._free(configInputPtr);
  wasmPrivModules._free(resultFirstPtr);
  wasmPrivModules._free(resultLenPtr);
};

const checkIfModelsLoaded = () => {
  try {
    const isLoaded = wasmPrivModules._privid_check_models();
    return isLoaded;
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
    return 0;
  }
};

const freeMemory = () => {
  try {
    const isLoaded = wasmPrivModules._privid_free_memory();
    return isLoaded;
  } catch (e) {
    printLogs(`Error: `, e, 'ERROR');
    return 0;
  }
};

Comlink.expose({
  ultraEnroll,
  ultraPredict,
  ultraAgeEstimate,
  ultraCompareEmbeddings,
  isLoad,
  pkiEncrypt,
  checkIfModelsLoaded,
  ultraScanBackDocument,
  ultraScanFrontDocument,
  ultraDocumentOcr,
  freeMemory,
});

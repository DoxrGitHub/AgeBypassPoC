# AgeBypassPoC

The repository follows this post of mine, [Age Verification Bypass - Google/PrivateID](https://doxrgithub.github.io/doxrblogs/posts/googleage/). This extension can automatically verify the primary authenticated user of the browser as an adult (as of 12/11/2025), if their settings were locked for being a minor.

You can install this extension manually on chrome://extensions; use the Load Unpacked button.

Disclaimer (from ChatGPT):

This project is a **research Proof-of-Concept** demonstrating the inherent limitations of **client-side, privacy-preserving age estimation** systems. It does **not** exploit any server-side vulnerabilities, does **not** access data it shouldn't, and does **not** circumvent any protected resources.

This repository is published **for educational and research purposes only**, to document:

* how WASM-based inference behaves on the client,
* why client-side integrity cannot be guaranteed, and
* what design trade-offs lead to bypasses like this.

**You are solely responsible for how you use any information or code in this repository.
Do not use this project to violate Terms of Service or to bypass age verification on accounts you do not own.**

The code is provided *as-is*, without warranty, and should be treated purely as a study of browser-side trust boundaries — **not a tool for practical usage.**

---

Basically, just don't use this as a tool unless you know what you're doing.

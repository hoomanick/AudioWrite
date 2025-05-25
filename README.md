

# AudioWrite ✨

*Effortless dictation powered by Gemini. Turn rambling voice recordings into perfectly transcribed and polished notes.*

[![Gemini API](https://img.shields.io/badge/Powered%20by-Gemini%20API-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/docs/gemini_api_overview)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge)](https://opensource.org/licenses/Apache-2.0)

AudioWrite is a client-side web application that leverages Google's Gemini AI to transform your voice recordings into accurate transcriptions and then refines them into well-structured, polished notes.

## 🚀 Live Demo

[Try AudioWrite Live!](https://hoomanick.github.io/AudioWrite/)

## 🌟 Key Features

*   🗣️ **Voice Recording & Dictation:** Record audio directly in your browser.
*   🧠 **AI-Powered Transcription:** Fast and accurate speech-to-text using Gemini.
*   📝 **AI-Powered Note Polishing:** Gemini refines raw transcriptions into clean, Markdown-formatted notes.
*   🌐 **Multi-language Output:** Select the output language for polished notes.
*   ✨ **Customizable Polishing Prompts:** Guide the AI with specific instructions.
*   👁️ **Live Audio Waveform:** Visual feedback during recording.
*   🎯 **Focus Mode:** Minimalist UI to help you concentrate.
*   💾 **Local Storage:** Notes are saved persistently in your browser.
*   🔑 **Session-Based API Key:** Securely handles your API key.
*   🎨 **Dark & Light Themes:** Switch to your preferred mode.
*   🗂️ **Note Archive:** Manage, load, re-polish, and delete notes.
*   📱 **Responsive Design:** Works on desktop and mobile.
*   PWA **Progressive Web App:** Installable for an app-like experience.

## 📸 Screenshots

*(It's highly recommended to add 2-3 screenshots of your application here. For example:*
*   *Main interface showing a polished note.*
*   *Live recording interface with waveform.*
*   *Archive modal and Settings modal.*)

<!-- Example: <img src="docs/screenshot-main.png" alt="AudioWrite Main Interface" width="600"/> -->

## 🛠️ Core Technologies

*   **Frontend:** HTML5, CSS3, TypeScript
*   **AI:** Google Gemini API (`@google/genai`)
*   **Markdown Rendering:** `marked`
*   **PWA:** Service Worker (temporarily commented out, needs Vite-specific PWA plugin for build compatibility)
*   **Storage:** Browser Local Storage (notes) & Session Storage (API key)
*   **Build Tool:** Vite

## ⚙️ Getting Started

### Prerequisites

*   A modern web browser (e.g., Chrome, Firefox, Safari, Edge).
*   **Your own Google Gemini API Key.** You can obtain one from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Running Locally (after cloning)

If you want to run a local copy *after cloning the repository*:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/hoomanick/AudioWrite.git
    cd AudioWrite
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will usually open the app in your browser at `http://localhost:5173` (or a similar port).

4.  **Set Your API Key:**
    *   Click the **Settings icon** (🔑) in the app.
    *   Enter your Gemini API Key and click "Save & Apply Key".
    *   **This key is required for all AI features.** It's stored in `sessionStorage` (cleared when you close the browser tab/window).

## 📖 How to Use

1.  **Set API Key:** If not already done, provide your Gemini API Key via Settings (🔑).
2.  **Record:** Click the microphone button (🎙️). Grant microphone permission if prompted.
3.  **Speak:** Dictate your content.
4.  **Stop:** Click the stop button (⏹️).
5.  **Review & Edit:**
    *   The **Polished Note** is shown by default.
    *   Switch to **Raw Transcription** using the tabs.
    *   Edit the note title, raw transcription, or polished content directly. Changes save automatically.
6.  **Customize (Optional):**
    *   **Output Language:** Select your desired language for the polished note.
    *   **Custom Prompt (✨):** Provide specific instructions to the AI for note polishing (e.g., "Summarize in 3 bullet points," "Adopt a formal tone").
7.  **Manage Notes:**
    *   **New Note (📄):** Creates a blank note.
    *   **Archive (🗄️):** View, load, re-polish, or delete saved notes.
    *   **Theme (☀️/🌙):** Toggle light/dark mode.

## 🌍 PWA (Progressive Web App)

*   **Installable:** On supported devices, install AudioWrite for an app-like experience.
*   **Offline Access:** The app shell and previously saved notes (from local storage) are accessible offline.
*   *Note: AI features require an active internet connection and a valid API key for the session. The Service Worker functionality for advanced PWA features (like full offline asset caching post-build) needs to be integrated with a Vite-specific PWA plugin (e.g., `vite-plugin-pwa`) for optimal compatibility with the build process.*

## 🚀 Deployment

AudioWrite is built using Vite and deployed as a static website to GitHub Pages.

### GitHub Pages Deployment Steps (Summary):

1.  Push your code to your GitHub repository (`main` branch for source).
2.  Ensure `vite.config.ts` has the correct `base` path (e.g., `/AudioWrite/`).
3.  Ensure `package.json` has the correct `homepage` URL.
4.  Run `npm run deploy`. This script builds the project and pushes the `dist` folder contents to the `gh-pages` branch.
5.  Configure GitHub Pages (Settings > Pages) to deploy from the `gh-pages` branch.
6.  Your site will be available at `https://hoomanick.github.io/AudioWrite/`.
7.  *Users of the deployed version will need to provide their own Gemini API Key.*

## 🙌 Contributing

Contributions are welcome! Please feel free to fork the project, create a feature branch, commit your changes, and open a Pull Request.

## 📜 License

This project is licensed under the Apache License 2.0. See the `SPDX-License-Identifier` in `index.tsx` or visit [Apache License 2.0](https://opensource.org/licenses/Apache-2.0).

## 🙏 Acknowledgements

*   Created by Hooman Nick.
*   Powered by the Google Gemini API.
*   Uses Marked.js for Markdown rendering and Font Awesome for icons.
*   Built with Vite.

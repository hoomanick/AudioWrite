/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {GoogleGenAI, GenerateContentResponse} from '@google/genai';
import {marked} from 'marked';

const MODEL_NAME = 'gemini-2.5-flash';
const LOCAL_STORAGE_API_KEY = 'voiceNotesApp_apiKey';
const SESSION_STORAGE_IOS_A2HS_DISMISSED = 'voiceNotesApp_iosA2HSDismissed';
const LOCAL_STORAGE_AUTO_POLISH = 'voiceNotesApp_autoPolish';

// --- IndexedDB Helper Functions ---
const DB_NAME = 'VoiceNotesDB';
const STORE_NAME = 'notes';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function saveNoteToDB(note: Note): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(note);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getAllNotesFromDB(): Promise<Note[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteNoteFromDB(noteId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(noteId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
// --- End IndexedDB Helper Functions ---


interface Note {
  id: string;
  title: string;
  rawTranscription: string;
  polishedNote: string;
  timestamp: number;
  audioBlob?: Blob;
  audioMimeType?: string;
  targetLanguage: string; // BCP-47 code
  customPolishingPrompt?: string;
}

const DEFAULT_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'it', name: 'Italian (Italiano)' },
  { code: 'pt', name: 'Portuguese (Português)' },
  { code: 'fa', name: 'Persian (فارسی)' },
  { code: 'zh-CN', name: 'Chinese (Simplified / 简体中文)' },
  { code: 'ja', name: 'Japanese (日本語)' },
  { code: 'ko', name: 'Korean (한국어)' },
  { code: 'ru', name: 'Russian (Русский)' },
  { code: 'ar', name: 'Arabic (العربية)' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
];

class VoiceNotesApp {
  private genAI: GoogleGenAI | null = null;
  private userApiKey: string | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private recordButton: HTMLButtonElement;
  private recordingStatus: HTMLDivElement;
  private rawTranscriptionDiv: HTMLDivElement;
  private polishedNoteDiv: HTMLDivElement;
  private newButton: HTMLButtonElement;
  private themeToggleButton: HTMLButtonElement;
  private themeToggleIcon: HTMLElement;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private stream: MediaStream | null = null;
  private editorTitleDiv: HTMLDivElement;
  private currentNoteTimestampDisplay: HTMLDivElement;

  private recordingInterface: HTMLDivElement;
  private liveRecordingTitle: HTMLDivElement;
  private liveWaveformCanvas: HTMLCanvasElement | null;
  private liveWaveformCtx: CanvasRenderingContext2D | null = null;
  private liveRecordingTimerDisplay: HTMLDivElement;
  private statusIndicatorDiv: HTMLDivElement | null;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  // FIX: Declare missing waveformDataArray property.
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;

  private outputLanguageSelect: HTMLSelectElement;
  private toggleCustomPromptButton: HTMLButtonElement;
  private customPromptContainer: HTMLDivElement;
  private customPromptTextarea: HTMLTextAreaElement;
  private applyCustomPromptButton: HTMLButtonElement;
  private autoPolishToggle: HTMLInputElement;
  
  private archiveButton: HTMLButtonElement;
  private archiveModal: HTMLDivElement;
  private archiveListContainer: HTMLDivElement;
  private closeArchiveModalButton: HTMLButtonElement;

  private settingsButton: HTMLButtonElement;
  private settingsModal: HTMLDivElement;
  private closeSettingsModalButton: HTMLButtonElement;
  private apiKeyInput: HTMLInputElement;
  private saveApiKeyButton: HTMLButtonElement;
  private apiKeyStatus: HTMLParagraphElement;

  private copyPolishedNoteButton: HTMLButtonElement;
  private copyRawTranscriptionButton: HTMLButtonElement;


  private allNotes: Note[] = [];
  private currentNoteId: string | null = null;

  private appContainer: HTMLDivElement;
  private focusPromptOverlay: HTMLDivElement;
  private isLiveRecordingActive = false;
  private isAutoPolishEnabled = true;
  private wakeLockSentinel: any | null = null;

  // PWA Install related
  private deferredInstallPrompt: any | null = null; // Using 'any' as BeforeInstallPromptEvent is not standard
  private iosInstallBanner: HTMLDivElement;
  private dismissIosInstallBannerButton: HTMLButtonElement;
  private installAppSection: HTMLDivElement;
  private installAppButton: HTMLButtonElement;


  constructor() {
    this.appContainer = document.querySelector('.app-container') as HTMLDivElement;
    this.focusPromptOverlay = document.getElementById('focusPromptOverlay') as HTMLDivElement;

    this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
    this.recordingStatus = document.getElementById('recordingStatus') as HTMLDivElement;
    this.rawTranscriptionDiv = document.getElementById('rawTranscription') as HTMLDivElement;
    this.polishedNoteDiv = document.getElementById('polishedNote') as HTMLDivElement;
    this.newButton = document.getElementById('newButton') as HTMLButtonElement;
    this.themeToggleButton = document.getElementById('themeToggleButton') as HTMLButtonElement;
    this.themeToggleIcon = this.themeToggleButton.querySelector('i') as HTMLElement;
    this.editorTitleDiv = document.querySelector('.editor-title') as HTMLDivElement;
    this.currentNoteTimestampDisplay = document.getElementById('currentNoteTimestamp') as HTMLDivElement;

    this.recordingInterface = document.querySelector('.recording-interface') as HTMLDivElement;
    this.liveRecordingTitle = document.getElementById('liveRecordingTitle') as HTMLDivElement;
    this.liveWaveformCanvas = document.getElementById('liveWaveformCanvas') as HTMLCanvasElement;
    this.liveRecordingTimerDisplay = document.getElementById('liveRecordingTimerDisplay') as HTMLDivElement;

    this.outputLanguageSelect = document.getElementById('outputLanguageSelect') as HTMLSelectElement;
    this.toggleCustomPromptButton = document.getElementById('toggleCustomPromptButton') as HTMLButtonElement;
    this.customPromptContainer = document.getElementById('customPromptContainer') as HTMLDivElement;
    this.customPromptTextarea = document.getElementById('customPromptTextarea') as HTMLTextAreaElement;
    this.applyCustomPromptButton = document.getElementById('applyCustomPromptButton') as HTMLButtonElement;
    this.autoPolishToggle = document.getElementById('autoPolishToggle') as HTMLInputElement;

    this.archiveButton = document.getElementById('archiveButton') as HTMLButtonElement;
    this.archiveModal = document.getElementById('archiveModal') as HTMLDivElement;
    this.archiveListContainer = document.getElementById('archiveListContainer') as HTMLDivElement;
    this.closeArchiveModalButton = document.getElementById('closeArchiveModalButton') as HTMLButtonElement;

    this.settingsButton = document.getElementById('settingsButton') as HTMLButtonElement;
    this.settingsModal = document.getElementById('settingsModal') as HTMLDivElement;
    this.closeSettingsModalButton = document.getElementById('closeSettingsModalButton') as HTMLButtonElement;
    this.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
    this.saveApiKeyButton = document.getElementById('saveApiKeyButton') as HTMLButtonElement;
    this.apiKeyStatus = document.getElementById('apiKeyStatus') as HTMLParagraphElement;
    
    this.copyPolishedNoteButton = document.getElementById('copyPolishedNoteButton') as HTMLButtonElement;
    this.copyRawTranscriptionButton = document.getElementById('copyRawTranscriptionButton') as HTMLButtonElement;

    this.iosInstallBanner = document.getElementById('iosInstallBanner') as HTMLDivElement;
    this.dismissIosInstallBannerButton = document.getElementById('dismissIosInstallBannerButton') as HTMLButtonElement;
    this.installAppSection = document.getElementById('installAppSection') as HTMLDivElement;
    this.installAppButton = document.getElementById('installAppButton') as HTMLButtonElement;

    if (this.liveWaveformCanvas) {
      this.liveWaveformCtx = this.liveWaveformCanvas.getContext('2d');
    }
    if (this.recordingInterface) {
      this.statusIndicatorDiv = this.recordingInterface.querySelector('.status-indicator') as HTMLDivElement;
    }

    this.populateLanguageDropdown();
    this.bindEventListeners();
    this.initTheme();
    this.initializePWAInstallHandlers();

    this.initializeApiKey();

    const storedAutoPolish = localStorage.getItem(LOCAL_STORAGE_AUTO_POLISH);
    this.isAutoPolishEnabled = storedAutoPolish === null ? true : storedAutoPolish === 'true';
    this.autoPolishToggle.checked = this.isAutoPolishEnabled;
    
    this.initializeNotes();
  }
  
  private async initializeNotes(): Promise<void> {
    await this.loadNotes();
    
    if (this.allNotes.length === 0) {
      await this.createNewNote(); 
    } else {
      const lastNote = this.allNotes.sort((a,b) => b.timestamp - a.timestamp)[0];
      this.loadNoteIntoEditor(lastNote.id); 
    }
    
    this.updateApplyCustomPromptButtonState(); 
    this.checkAndSetFocusMode();
  }

  private initializeApiKey(): void {
    const storedKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
    if (storedKey) {
      this.userApiKey = storedKey;
      try {
        this.genAI = new GoogleGenAI({ apiKey: this.userApiKey });
      } catch (e) {
        console.error("Failed to initialize GoogleGenAI with stored key:", e);
        this.genAI = null;
        this.userApiKey = null;
        localStorage.removeItem(LOCAL_STORAGE_API_KEY);
      }
    }
    this.updateUiForApiKey();
  }
  
  private setApiKey(): void {
    const newKey = this.apiKeyInput.value.trim();
    this.apiKeyInput.value = ''; // Clear input for security
  
    if (!newKey) {
      localStorage.removeItem(LOCAL_STORAGE_API_KEY);
      this.userApiKey = null;
      this.genAI = null;
      this.updateApiKeyStatusUI('warning', 'API Key cleared.');
    } else {
      localStorage.setItem(LOCAL_STORAGE_API_KEY, newKey);
      this.userApiKey = newKey;
      try {
        this.genAI = new GoogleGenAI({ apiKey: this.userApiKey });
        this.updateApiKeyStatusUI('success', 'API Key saved and applied successfully.');
      } catch(e) {
        console.error("Failed to initialize GoogleGenAI with new key:", e);
        this.genAI = null;
        this.userApiKey = null;
        localStorage.removeItem(LOCAL_STORAGE_API_KEY);
        this.updateApiKeyStatusUI('error', 'Invalid API Key format. Key not saved.');
      }
    }
  
    this.updateUiForApiKey();
    this.closeSettingsModal();
  }

  private updateApiKeyStatusUI(statusType?: 'success' | 'error' | 'warning' | 'info', message?: string): void {
    if (!this.apiKeyStatus) return;

    if (statusType && message) {
        this.apiKeyStatus.className = `api-key-status ${statusType}`;
        this.apiKeyStatus.textContent = message;
        return;
    }

    if (this.userApiKey) {
        this.apiKeyStatus.className = 'api-key-status success';
        this.apiKeyStatus.textContent = 'API Key is currently set.';
        this.apiKeyInput.setAttribute('placeholder', 'Enter a new key to replace the current one');
    } else {
        this.apiKeyStatus.className = 'api-key-status warning';
        this.apiKeyStatus.textContent = 'API Key is not set. AI features are disabled.';
        this.apiKeyInput.setAttribute('placeholder', 'Paste your API Key here');
    }
  }

  private updateUiForApiKey(): void {
    const isApiKeySet = !!(this.userApiKey && this.genAI);
    if (this.recordingStatus && !this.isRecording && !this.isLiveRecordingActive) { 
        if (!isApiKeySet) {
            this.recordingStatus.innerHTML = 'API Key needed. Go to Settings <i class="fas fa-key"></i> to add one.';
            this.recordingStatus.className = 'status-text warning';
        } else {
            this.recordingStatus.textContent = 'Ready to record';
            this.recordingStatus.className = 'status-text';
        }
    }
    
    this.recordButton.disabled = !isApiKeySet;
    
    if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
        this.renderArchiveList();
    }
    this.updateRecordButtonGlowState();
    this.updateApplyCustomPromptButtonState();
  }

  private updateRecordButtonGlowState(): void {
    const isApiKeySet = !!this.userApiKey;
    const isIdle = !this.isRecording && !this.isLiveRecordingActive;
    const currentNote = this.getCurrentNote();
    const isNoteEmpty = !currentNote || 
                        (!currentNote.audioBlob && 
                         !currentNote.rawTranscription && 
                         !currentNote.polishedNote);

    if (this.settingsButton) {
        if (!isApiKeySet && isIdle) {
            this.settingsButton.classList.add('settings-needs-glow');
        } else {
            this.settingsButton.classList.remove('settings-needs-glow');
        }
    }
    
    if (this.recordButton) {
        if (isApiKeySet && isIdle && isNoteEmpty) {
          this.recordButton.classList.add('record-button-ready-glow');
        } else {
          this.recordButton.classList.remove('record-button-ready-glow');
        }
    }
  }

  private populateLanguageDropdown(): void {
    DEFAULT_LANGUAGES.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      this.outputLanguageSelect.appendChild(option);
    });
    this.outputLanguageSelect.value = DEFAULT_LANGUAGES.find(l => l.code === 'en')?.code || DEFAULT_LANGUAGES[0].code;
  }

  private bindEventListeners(): void {
    this.recordButton.addEventListener('click', () => this.toggleRecording());
    this.newButton.addEventListener('click', () => this.createNewNote());
    this.themeToggleButton.addEventListener('click', () => this.toggleTheme());
    window.addEventListener('resize', this.handleResize.bind(this));
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    this.outputLanguageSelect.addEventListener('change', () => this.handleOutputLanguageChange());
    this.toggleCustomPromptButton.addEventListener('click', () => this.toggleCustomPromptDisplay());
    this.customPromptTextarea.addEventListener('blur', () => this.handleCustomPromptChange());
    this.applyCustomPromptButton.addEventListener('click', () => this.handleApplyCustomPrompt());
    this.autoPolishToggle.addEventListener('change', () => this.handleAutoPolishToggle());
    this.editorTitleDiv.addEventListener('blur', () => this.handleTitleChange());

    this.archiveButton.addEventListener('click', () => this.openArchiveModal());
    this.closeArchiveModalButton.addEventListener('click', () => this.closeArchiveModal());

    this.settingsButton.addEventListener('click', () => this.openSettingsModal());
    this.closeSettingsModalButton.addEventListener('click', () => this.closeSettingsModal());
    this.saveApiKeyButton.addEventListener('click', () => this.setApiKey());

    this.rawTranscriptionDiv.addEventListener('blur', () => this.handleContentEditableChange('rawTranscription'));
    this.polishedNoteDiv.addEventListener('blur', () => this.handleContentEditableChange('polishedNote'));
    
    this.copyPolishedNoteButton.addEventListener('click', () => this.copyContent('polished'));
    this.copyRawTranscriptionButton.addEventListener('click', () => this.copyContent('raw'));

    if (this.installAppButton) {
        this.installAppButton.addEventListener('click', () => this.promptInstall());
    }
    if (this.dismissIosInstallBannerButton) {
        this.dismissIosInstallBannerButton.addEventListener('click', () => this.dismissIosBanner());
    }
  }

  /**
   * Safety net for iOS/mobile recording.
   * If the page is hidden (e.g., screen lock, user switches tabs), the browser
   * will suspend microphone access, silently killing the recording. This listener
   * detects that and gracefully stops the recording, ensuring the audio captured
   * up to that point is saved and processed.
   */
  private async handleVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'hidden' && this.isRecording) {
      console.log('Page became hidden during recording. Automatically stopping to preserve data.');
      await this.stopRecording();
    }
  }

  private initializePWAInstallHandlers(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); 
      this.deferredInstallPrompt = e; 
      if (this.installAppSection) {
        this.installAppSection.classList.remove('hidden'); 
      }
    });

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

    if (isIOS && !isInStandaloneMode && !sessionStorage.getItem(SESSION_STORAGE_IOS_A2HS_DISMISSED)) {
      if (this.iosInstallBanner) {
        this.iosInstallBanner.classList.remove('hidden');
      }
    }
  }

  private async promptInstall(): Promise<void> {
    if (this.deferredInstallPrompt && this.installAppSection) {
      this.installAppSection.classList.add('hidden'); 
      this.deferredInstallPrompt.prompt(); 
      try {
        const { outcome } = await this.deferredInstallPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
      } catch (error) {
        console.error("Error showing install prompt:", error);
      }
      this.deferredInstallPrompt = null; 
    }
  }

  private dismissIosBanner(): void {
    if (this.iosInstallBanner) {
      this.iosInstallBanner.classList.add('hidden');
      sessionStorage.setItem(SESSION_STORAGE_IOS_A2HS_DISMISSED, 'true');
    }
  }
  
  private handleResize(): void {
    if (this.liveWaveformCanvas && this.liveWaveformCtx && this.isLiveRecordingActive) {
      this.setupWaveformCanvas();
    }
  }
  
  private checkAndSetFocusMode(): void {
    const isApiKeySet = !!this.userApiKey;
    const currentNote = this.getCurrentNote();
    const isNoteEmpty = !currentNote || 
                        (!currentNote.audioBlob && 
                         !currentNote.rawTranscription && 
                         !currentNote.polishedNote);

    if (!isApiKeySet) {
        this.appContainer.classList.add('app-initial-api-focus');
        this.focusPromptOverlay.classList.add('hidden'); // No focus prompt if API key needed
    } else {
        this.appContainer.classList.remove('app-initial-api-focus');
        if (isNoteEmpty) {
            this.focusPromptOverlay.classList.remove('hidden');
        } else {
            this.focusPromptOverlay.classList.add('hidden');
        }
    }
    this.updateRecordButtonGlowState();
  }

  private updateUiForRecordingState(isRecording: boolean): void {
    this.isLiveRecordingActive = isRecording;
    this.appContainer.classList.toggle('app-is-live-recording', isRecording);
    this.recordButton.classList.toggle('recording', isRecording);
    this.recordingInterface.classList.toggle('is-live', isRecording);
    this.focusPromptOverlay.classList.add('hidden');

    const micIcon = this.recordButton.querySelector('.fa-microphone');
    const stopIconHTML = '<i class="fas fa-stop"></i>';
    if(micIcon) {
        micIcon.outerHTML = stopIconHTML;
    }

    if (isRecording) {
      if (this.liveRecordingTitle && this.liveWaveformCanvas && this.liveRecordingTimerDisplay) {
        this.liveRecordingTitle.style.display = 'block';
        this.liveWaveformCanvas.style.display = 'block';
        this.liveRecordingTimerDisplay.style.display = 'block';
      }
    } else {
      if (this.liveRecordingTitle && this.liveWaveformCanvas && this.liveRecordingTimerDisplay) {
        this.liveRecordingTitle.style.display = 'none';
        this.liveWaveformCanvas.style.display = 'none';
        this.liveRecordingTimerDisplay.style.display = 'none';
      }
      const stopIcon = this.recordButton.querySelector('.fa-stop');
      const micIconHTML = '<i class="fas fa-microphone"></i>';
      if(stopIcon) {
          stopIcon.outerHTML = micIconHTML;
      }
      this.updateUiForApiKey(); // Re-evaluate status text etc.
    }
  }

  private updateLiveRecordingTimer(): void {
    const elapsed = Date.now() - this.recordingStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const milliseconds = Math.floor((elapsed % 1000) / 10);
    if (this.liveRecordingTimerDisplay) {
      this.liveRecordingTimerDisplay.textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
    }
  }

  private setupWaveformCanvas(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.liveWaveformCanvas.getBoundingClientRect();
    this.liveWaveformCanvas.width = rect.width * dpr;
    this.liveWaveformCanvas.height = rect.height * dpr;
    this.liveWaveformCtx.scale(dpr, dpr);
  }

  private drawLiveWaveform(): void {
    if (!this.analyserNode || !this.waveformDataArray || !this.liveWaveformCtx || !this.liveWaveformCanvas) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      return;
    }

    this.waveformDrawingId = requestAnimationFrame(() => this.drawLiveWaveform());
    this.analyserNode.getByteTimeDomainData(this.waveformDataArray);

    const ctx = this.liveWaveformCtx;
    const canvas = this.liveWaveformCanvas;
    const bufferLength = this.analyserNode.frequencyBinCount;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    ctx.beginPath();
    
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = this.waveformDataArray[i] / 128.0;
      const y = v * canvas.height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }
  
  private async createNewNote(): Promise<void> {
    const newNote: Note = {
      id: self.crypto.randomUUID(),
      title: 'Untitled Note',
      rawTranscription: '',
      polishedNote: '',
      timestamp: Date.now(),
      targetLanguage: this.outputLanguageSelect.value,
    };
    this.allNotes.push(newNote);
    await saveNoteToDB(newNote);
    this.loadNoteIntoEditor(newNote.id);
    this.checkAndSetFocusMode();
  }
  
  private async loadNotes(): Promise<void> {
    this.allNotes = await getAllNotesFromDB();
  }

  private async saveCurrentNote(): Promise<void> {
    const note = this.getCurrentNote();
    if (note) {
      await saveNoteToDB(note);
    }
  }

  private getCurrentNote(): Note | undefined {
    return this.allNotes.find(n => n.id === this.currentNoteId);
  }

  private loadNoteIntoEditor(noteId: string): void {
    const note = this.allNotes.find(n => n.id === noteId);
    if (!note) return;

    this.currentNoteId = noteId;
    
    this.editorTitleDiv.textContent = note.title;
    this.rawTranscriptionDiv.innerHTML = note.rawTranscription;
    this.polishedNoteDiv.innerHTML = note.polishedNote;
    this.currentNoteTimestampDisplay.textContent = `Created: ${new Date(note.timestamp).toLocaleString()}`;
    this.outputLanguageSelect.value = note.targetLanguage || 'en';
    this.customPromptTextarea.value = note.customPolishingPrompt || '';

    this.updateContentPlaceholders();
    this.updateApplyCustomPromptButtonState();
    this.checkAndSetFocusMode();
  }

  private handleOutputLanguageChange(): void {
    const note = this.getCurrentNote();
    if (note) {
      note.targetLanguage = this.outputLanguageSelect.value;
      this.saveCurrentNote();
    }
  }
  
  private toggleCustomPromptDisplay(): void {
    this.customPromptContainer.classList.toggle('hidden');
    const icon = this.toggleCustomPromptButton.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-wand-magic-sparkles');
        icon.classList.toggle('fa-chevron-up');
    }
  }
  
  private handleCustomPromptChange(): void {
    const note = this.getCurrentNote();
    if (note) {
      note.customPolishingPrompt = this.customPromptTextarea.value.trim();
      this.saveCurrentNote();
      this.updateApplyCustomPromptButtonState();
    }
  }
  
  private async handleApplyCustomPrompt(): Promise<void> {
    const note = this.getCurrentNote();
    if (!note || !this.genAI) return;
    
    // Ensure latest prompt is saved before polishing
    this.handleCustomPromptChange();

    if (!note.rawTranscription) {
      if (note.audioBlob) {
        // If there's audio but no transcription, transcribe first
        await this.transcribeNote(note.id);
        // After transcription, the polished note might be generated automatically.
        // Re-check state.
        const updatedNote = this.getCurrentNote();
        if (updatedNote && updatedNote.polishedNote) {
            // Already auto-polished, no need to do it again unless forced
            console.log("Auto-polished after transcription. Manual polish skipped.");
            return;
        }
      } else {
        this.updateStatus('error', 'No audio or transcription available to polish.');
        return;
      }
    }
    
    await this.polishNote(note.id);
  }

  private updateApplyCustomPromptButtonState(): void {
    const note = this.getCurrentNote();
    const isApiKeySet = !!this.userApiKey;
    if (!note || !isApiKeySet) {
      this.applyCustomPromptButton.disabled = true;
      return;
    }
    const hasContentToPolish = !!note.rawTranscription || !!note.audioBlob;
    this.applyCustomPromptButton.disabled = !hasContentToPolish;
  }
  
  private handleAutoPolishToggle(): void {
    this.isAutoPolishEnabled = this.autoPolishToggle.checked;
    localStorage.setItem(LOCAL_STORAGE_AUTO_POLISH, String(this.isAutoPolishEnabled));
  }
  
  private handleTitleChange(): void {
    const note = this.getCurrentNote();
    if (note && note.title !== this.editorTitleDiv.textContent) {
      note.title = this.editorTitleDiv.textContent || 'Untitled Note';
      this.saveCurrentNote();
    }
  }
  
  private handleContentEditableChange(field: 'rawTranscription' | 'polishedNote'): void {
    const note = this.getCurrentNote();
    if (note) {
      const div = field === 'rawTranscription' ? this.rawTranscriptionDiv : this.polishedNoteDiv;
      if (note[field] !== div.innerHTML) {
        note[field] = div.innerHTML;
        this.saveCurrentNote();
        this.updateContentPlaceholders();
      }
    }
  }
  
  private updateContentPlaceholders(): void {
    ['rawTranscriptionDiv', 'polishedNoteDiv'].forEach(divName => {
        const div = this[divName as keyof this] as HTMLDivElement;
        const placeholder = div.getAttribute('placeholder');
        
        // Use innerText to check for visible content, ignoring HTML tags like <br>
        const hasContent = div.innerText.trim().length > 0;
        
        if (!hasContent && placeholder) {
            if (!div.innerHTML.includes('placeholder-active')) {
                div.classList.add('placeholder-active');
                div.innerHTML = placeholder;
            }
        } else if (hasContent && div.classList.contains('placeholder-active')) {
            div.classList.remove('placeholder-active');
            if(div.innerHTML === placeholder) {
              div.innerHTML = ''; // Clear if it was just the placeholder
            }
        }
    });
  }

  private async requestWakeLock(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          console.log('Screen Wake Lock was released');
        });
        console.log('Screen Wake Lock is active');
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    } else {
      console.log('Wake Lock API is not supported by this browser.');
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      await this.wakeLockSentinel.release();
      this.wakeLockSentinel = null;
    }
  }
  
  private async toggleRecording(): Promise<void> {
    if (!this.genAI) {
      this.updateStatus('error', 'API Key not set. Please add one in Settings.');
      return;
    }

    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isRecording = true;
      this.recordButton.disabled = true; // Disable until fully started

      this.updateUiForRecordingState(true);
      this.requestWakeLock();
      this.audioChunks = [];
      const options = { mimeType: 'audio/webm' };
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.mediaRecorder.ondataavailable = (event) => this.audioChunks.push(event.data);
      this.mediaRecorder.onstop = () => this.processAudio();
      
      // Setup audio context for visualization
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.waveformDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      source.connect(this.analyserNode);
      
      this.handleResize();
      this.drawLiveWaveform();
      
      this.recordingStartTime = Date.now();
      this.timerIntervalId = window.setInterval(() => this.updateLiveRecordingTimer(), 50);

      this.mediaRecorder.start();
      this.recordButton.disabled = false; // Re-enable now
      this.updateStatus('info', 'Recording...');

    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus('error', 'Microphone access denied.');
      this.isRecording = false;
      this.updateUiForRecordingState(false);
      this.releaseWakeLock();
      this.recordButton.disabled = false;
    }
  }

  private async stopRecording(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    
    this.updateStatus('info', 'Processing audio...');
    this.recordButton.disabled = true; // Disable until processing is done
    
    this.mediaRecorder.stop();
    this.stream?.getTracks().forEach(track => track.stop());
    this.isRecording = false;
    
    if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.audioContext?.close();
    
    this.updateUiForRecordingState(false);
    this.releaseWakeLock();
    // processAudio() will be called by onstop event
  }

  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.updateStatus('warning', 'No audio data captured, please try again.');
      this.recordButton.disabled = false;
      return;
    }

    const note = this.getCurrentNote();
    if (!note) {
        console.error("No current note to process audio for.");
        this.recordButton.disabled = false;
        return;
    }

    const mimeType = this.audioChunks[0].type;
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    this.audioChunks = [];
    
    note.audioBlob = audioBlob;
    note.audioMimeType = mimeType;
    await this.saveCurrentNote();

    // Now, trigger transcription.
    await this.transcribeNote(note.id);
    
    this.recordButton.disabled = false;
    this.updateApplyCustomPromptButtonState();
  }
  
  private async transcribeNote(noteId: string): Promise<void> {
    const note = this.allNotes.find(n => n.id === noteId);
    if (!note || !note.audioBlob || !this.genAI) {
        this.updateStatus('error', 'Note or audio data is missing for transcription.');
        return;
    }
    
    try {
        this.updateStatus('info', 'Transcribing audio...');
        const audioData = await this.blobToBase64(note.audioBlob);
        const textPart = { text: "Transcribe the following audio:" };
        const audioPart = { inlineData: { mimeType: note.audioMimeType!, data: audioData } };
        
        const response: GenerateContentResponse = await this.genAI.models.generateContent({
            model: MODEL_NAME,
            contents: { parts: [textPart, audioPart] },
        });

        const transcription = response.text.trim();
        note.rawTranscription = transcription;
        this.rawTranscriptionDiv.innerHTML = transcription;
        await this.saveCurrentNote();
        this.updateStatus('success', 'Transcription complete!');
        this.updateContentPlaceholders();

        // Auto-polish if enabled
        if (this.isAutoPolishEnabled) {
            await this.polishNote(note.id);
        } else {
             // If not auto-polishing, ensure we reset status
            this.updateStatus('success', 'Transcription ready for polishing.');
        }

    } catch (error) {
        console.error('Error during transcription:', error);
        this.updateStatus('error', 'Transcription failed. Please try again.');
        note.rawTranscription = `*Transcription failed. You can try again using the "Transcribe" button in the archive.*`;
        if (this.currentNoteId === noteId) {
            this.rawTranscriptionDiv.innerHTML = note.rawTranscription;
        }
        await this.saveCurrentNote();
    } finally {
        this.updateApplyCustomPromptButtonState();
        if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
            this.renderArchiveList(); // Refresh archive view
        }
    }
  }


  private async polishNote(noteId: string): Promise<void> {
    const note = this.allNotes.find(n => n.id === noteId);
    if (!note || !this.genAI) return;
    if (!note.rawTranscription) {
      this.updateStatus('error', 'No transcription to polish.');
      return;
    }
    
    this.updateStatus('info', 'Polishing note with Gemini...');

    try {
      const languageName = DEFAULT_LANGUAGES.find(l => l.code === note.targetLanguage)?.name || 'the specified language';
      const userPrompt = note.customPolishingPrompt || 
        `You are a note-taking assistant. The user has provided a raw, messy audio transcription.
        Your task is to process this transcription and transform it into a well-structured, clear, and polished note.
        
        Follow these instructions:
        - Correct any spelling mistakes and grammatical errors.
        - Improve sentence structure and clarity for better readability.
        - Remove filler words, false starts, and unnecessary repetitions (e.g., "um", "ah", "like", "you know").
        - Organize the content logically. Use headings, bullet points, numbered lists, or bold text where appropriate to create a clear hierarchy.
        - The final output should be in ${languageName}.
        - Format the output using Markdown.
        - Do not add any commentary or preamble. Respond only with the polished note content.`;
        
      const response: GenerateContentResponse = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents: `USER_PROMPT: ${userPrompt}\n\nRAW_TRANSCRIPTION: ${note.rawTranscription}`,
      });
      
      const polishedContent = response.text;
      note.polishedNote = await marked(polishedContent);
      
      if (this.currentNoteId === note.id) {
          this.polishedNoteDiv.innerHTML = note.polishedNote;
          this.updateContentPlaceholders();
      }
      await this.saveCurrentNote();
      this.updateStatus('success', 'Note polishing complete!');

    } catch (error) {
      console.error('Error polishing note:', error);
      this.updateStatus('error', 'Failed to polish note.');
    }
  }
  
  private updateStatus(type: 'info' | 'success' | 'warning' | 'error', message: string, duration = 3000): void {
    if (!this.recordingStatus) return;
    this.recordingStatus.textContent = message;
    this.recordingStatus.className = `status-text ${type}`;
    if (type !== 'info') {
      setTimeout(() => {
          if (this.recordingStatus.textContent === message) { // Only clear if message hasn't changed
              this.updateUiForApiKey(); // This will reset to default or API key warning
          }
      }, duration);
    }
  }
  
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private openArchiveModal(): void {
    this.renderArchiveList();
    this.archiveModal.classList.remove('hidden');
  }

  private closeArchiveModal(): void {
    this.archiveModal.classList.add('hidden');
  }
  
  private renderArchiveList(): void {
    this.archiveListContainer.innerHTML = '';
    const sortedNotes = this.allNotes.sort((a, b) => b.timestamp - a.timestamp);

    if (sortedNotes.length === 0) {
        this.archiveListContainer.innerHTML = '<p style="text-align: center; color: var(--color-text-tertiary);">No saved notes yet.</p>';
        return;
    }

    sortedNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'archive-item';
        if (note.id === this.currentNoteId) {
            item.classList.add('disabled');
        }

        const previewText = this.getNotePreview(note);

        const isApiKeySet = !!this.userApiKey;
        const canPolish = isApiKeySet && note.rawTranscription && !note.rawTranscription.startsWith('*Transcription failed');
        const canTranscribe = isApiKeySet && note.audioBlob && (!note.rawTranscription || note.rawTranscription.startsWith('*Transcription failed'));
        
        item.innerHTML = `
            <div class="archive-item-header">
                <span class="archive-item-title">${note.title}</span>
                <span class="archive-item-timestamp">${new Date(note.timestamp).toLocaleDateString()}</span>
            </div>
            <div class="archive-item-content">
                <p>${previewText}</p>
            </div>
            <div class="archive-item-actions">
                <button class="action-button-small load-note" data-id="${note.id}" ${note.id === this.currentNoteId ? 'disabled' : ''}>
                    <i class="fas fa-folder-open"></i> Load
                </button>
                ${canTranscribe ? `
                    <button class="action-button-small transcribe-note" data-id="${note.id}">
                        <i class="fas fa-microphone-alt"></i> Transcribe
                    </button>
                ` : `
                    <button class="action-button-small repolish-note" data-id="${note.id}" ${!canPolish ? 'disabled title="Transcription needed or API key missing"' : ''}>
                        <i class="fas fa-wand-magic-sparkles"></i> Re-polish
                    </button>
                `}
                <button class="action-button-small danger delete-note" data-id="${note.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <audio controls class="action-button-small audio-player" ${note.audioBlob ? '' : 'style="display:none;"'}></audio>
            </div>
        `;

        this.archiveListContainer.appendChild(item);
        
        const audioPlayer = item.querySelector('.audio-player') as HTMLAudioElement;
        if (note.audioBlob && audioPlayer) {
          const audioURL = URL.createObjectURL(note.audioBlob);
          audioPlayer.src = audioURL;
          // Revoke URL when it's no longer needed, e.g. when modal closes
        }
    });

    this.bindArchiveItemEventListeners();
  }
  
  private getNotePreview(note: Note): string {
    if (note.polishedNote) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.polishedNote;
        return `<strong>Polished:</strong> ${tempDiv.textContent?.substring(0, 150) || '(empty)'}...`;
    }
    if (note.rawTranscription) {
        return `<strong>Raw:</strong> ${note.rawTranscription.substring(0, 150)}...`;
    }
    if (note.audioBlob) {
        return `<strong><i class="fas fa-microphone-alt"></i> Audio recorded</strong>, ready for transcription.`;
    }
    return '<em>Empty note...</em>';
  }

  private bindArchiveItemEventListeners(): void {
    this.archiveListContainer.querySelectorAll('.load-note').forEach(button => {
        button.addEventListener('click', (e) => {
            const noteId = (e.currentTarget as HTMLButtonElement).dataset.id;
            if (noteId) {
                this.loadNoteIntoEditor(noteId);
                this.closeArchiveModal();
            }
        });
    });

    this.archiveListContainer.querySelectorAll('.delete-note').forEach(button => {
        button.addEventListener('click', async (e) => {
            const noteId = (e.currentTarget as HTMLButtonElement).dataset.id;
            if (noteId && confirm('Are you sure you want to delete this note? This cannot be undone.')) {
                if(this.currentNoteId === noteId) {
                    alert("You cannot delete the currently active note.");
                    return;
                }
                await this.deleteNote(noteId);
                this.renderArchiveList(); // Re-render the list
            }
        });
    });

    this.archiveListContainer.querySelectorAll('.repolish-note').forEach(button => {
        button.addEventListener('click', async (e) => {
            const noteId = (e.currentTarget as HTMLButtonElement).dataset.id;
            if (noteId) {
                this.updateStatus('info', 'Re-polishing note...');
                this.closeArchiveModal();
                await this.polishNote(noteId);
                // If the repolished note is the current one, update editor
                if(this.currentNoteId === noteId) {
                    this.loadNoteIntoEditor(noteId);
                }
            }
        });
    });

    this.archiveListContainer.querySelectorAll('.transcribe-note').forEach(button => {
        button.addEventListener('click', async (e) => {
            const noteId = (e.currentTarget as HTMLButtonElement).dataset.id;
            if (noteId) {
                this.updateStatus('info', 'Retrying transcription...');
                this.closeArchiveModal();
                await this.transcribeNote(noteId);
                // If the transcribed note is the current one, update editor
                if(this.currentNoteId === noteId) {
                    this.loadNoteIntoEditor(noteId);
                }
            }
        });
    });
  }

  private async deleteNote(noteId: string): Promise<void> {
    this.allNotes = this.allNotes.filter(n => n.id !== noteId);
    await deleteNoteFromDB(noteId);
  }

  private openSettingsModal(): void {
    this.updateApiKeyStatusUI();
    this.settingsModal.classList.remove('hidden');
  }

  private closeSettingsModal(): void {
    this.settingsModal.classList.add('hidden');
    this.checkAndSetFocusMode();
  }
  
  private initTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || (storedTheme === null && prefersDark)) {
      document.body.classList.remove('light-mode');
      this.themeToggleIcon.classList.remove('fa-moon');
      this.themeToggleIcon.classList.add('fa-sun');
    } else {
      document.body.classList.add('light-mode');
      this.themeToggleIcon.classList.remove('fa-sun');
      this.themeToggleIcon.classList.add('fa-moon');
    }
  }

  private toggleTheme(): void {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    
    this.themeToggleIcon.classList.toggle('fa-sun', !isLightMode);
    this.themeToggleIcon.classList.toggle('fa-moon', isLightMode);
  }

  private copyContent(type: 'raw' | 'polished'): void {
    const contentDiv = type === 'raw' ? this.rawTranscriptionDiv : this.polishedNoteDiv;
    const button = type === 'raw' ? this.copyRawTranscriptionButton : this.copyPolishedNoteButton;
    
    // Create a temporary textarea to preserve formatting
    const textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    
    // Convert HTML to plain text, handling list items and paragraphs
    let textToCopy = this.htmlToPlainText(contentDiv.innerHTML);

    if (!textToCopy.trim()) {
        this.updateCopyButtonState(button, 'warning', 'No content to copy!');
        return;
    }

    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        this.updateCopyButtonState(button, 'success', 'Copied!');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        this.updateCopyButtonState(button, 'error', 'Failed!');
    } finally {
        document.body.removeChild(textarea);
    }
  }
  
  private htmlToPlainText(html: string): string {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Handle list items with prefixes
      tempDiv.querySelectorAll('li').forEach(li => {
          const parent = li.parentElement;
          if (parent && parent.tagName === 'UL') {
              li.prepend(document.createTextNode('- '));
          } else if (parent && parent.tagName === 'OL') {
              // Simple number for now, could be improved to get actual index
              li.prepend(document.createTextNode('1. '));
          }
      });
      
      // Add newlines for block elements
      tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre').forEach(el => {
         el.append(document.createTextNode('\n')); 
      });

      return tempDiv.innerText.trim();
  }

  private updateCopyButtonState(button: HTMLButtonElement, state: 'success' | 'error' | 'warning', message: string): void {
      const originalContent = button.innerHTML;
      const iconClass = state === 'success' ? 'fa-check' : (state === 'error' ? 'fa-times' : 'fa-exclamation-triangle');
      
      button.innerHTML = `<i class="fas ${iconClass}"></i> ${message}`;
      button.disabled = true;

      setTimeout(() => {
          button.innerHTML = originalContent;
          button.disabled = false;
      }, 2000);
  }

}

window.addEventListener('load', () => {
  new VoiceNotesApp();
});

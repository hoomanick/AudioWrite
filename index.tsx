/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {GoogleGenAI, GenerateContentResponse, Type} from '@google/genai';
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

    this.outputLanguageSelect.addEventListener('change', () => this.handleOutputLanguageChange());
    this.toggleCustomPromptButton.addEventListener('click', () => this.toggleCustomPromptDisplay());
    this.customPromptTextarea.addEventListener('blur', () => this.handleCustomPromptChange());
    this.applyCustomPromptButton.addEventListener('click', () => this.handleApplyCustomPrompt());
    this.autoPolishToggle.addEventListener('change', () => this.handleAutoPolishToggle());
    this.editorTitleDiv.addEventListener('blur', () => this.handleTitleChange());

    this.archiveButton.addEventListener('click', () => this.openArchiveModal());
    this.closeArchiveModalButton.addEventListener('click', () => this.closeArchiveModal());
    this.archiveModal.addEventListener('click', (event) => {
      if (event.target === this.archiveModal) {
        this.closeArchiveModal();
      }
    });

    this.settingsButton.addEventListener('click', () => this.openSettingsModal());
    this.closeSettingsModalButton.addEventListener('click', () => this.closeSettingsModal());
    this.settingsModal.addEventListener('click', (event) => {
        if (event.target === this.settingsModal) {
            this.closeSettingsModal();
        }
    });
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
        console.error('Error handling install prompt choice:', error);
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


  private async handleTitleChange(): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (currentNote && this.editorTitleDiv.textContent !== currentNote.title) {
        currentNote.title = this.editorTitleDiv.textContent || 'Untitled Note';
        await this.saveNote(currentNote);
        if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
            this.renderArchiveList();
        }
    }
  }

  private async handleContentEditableChange(type: 'rawTranscription' | 'polishedNote'): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (!currentNote) return;

    const div = type === 'rawTranscription' ? this.rawTranscriptionDiv : this.polishedNoteDiv;
    const currentText = div.id === 'polishedNote' ? div.innerHTML : div.textContent || ''; 
    
    let changed = false;
    if (type === 'rawTranscription' && currentText !== currentNote.rawTranscription) {
        currentNote.rawTranscription = currentText;
        changed = true;
    } else if (type === 'polishedNote' && currentText !== currentNote.polishedNote) {
        currentNote.polishedNote = currentText; 
        changed = true;
    } 
    
    if (changed) {
        await this.saveNote(currentNote);
        this.checkAndSetFocusMode(); 
        this.updateApplyCustomPromptButtonState(); // Raw transcription might have changed
    }
  }

  private async handleOutputLanguageChange(): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (currentNote) {
      currentNote.targetLanguage = this.outputLanguageSelect.value;
      await this.saveNote(currentNote);
      // No direct re-polish, user must click "Apply & Re-polish"
    }
  }

  private handleAutoPolishToggle(): void {
    this.isAutoPolishEnabled = this.autoPolishToggle.checked;
    localStorage.setItem(LOCAL_STORAGE_AUTO_POLISH, String(this.isAutoPolishEnabled));
  }

  private toggleCustomPromptDisplay(): void {
    this.customPromptContainer.classList.toggle('hidden');

    if (this.customPromptContainer.classList.contains('hidden')) {
        this.toggleCustomPromptButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Edit Custom Prompt';
        this.toggleCustomPromptButton.title = 'Show custom prompt options';
    } else {
        this.toggleCustomPromptButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Custom Prompt';
        this.toggleCustomPromptButton.title = 'Hide custom prompt options';
        this.customPromptTextarea.focus();
    }
    this.updateApplyCustomPromptButtonState();
  }
  
  private async handleCustomPromptChange(): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (currentNote) {
        currentNote.customPolishingPrompt = this.customPromptTextarea.value.trim() || undefined;
        await this.saveNote(currentNote);
        // No direct re-polish, user must click "Apply & Re-polish"
    }
  }

  private updateApplyCustomPromptButtonState(): void {
    const currentNote = this.getCurrentNote();
    
    const canPolish = !!(
        this.userApiKey &&
        this.genAI &&
        currentNote &&
        currentNote.rawTranscription &&
        currentNote.rawTranscription.trim() !== ''
    );
    this.applyCustomPromptButton.disabled = !canPolish;

    if (currentNote && currentNote.polishedNote && currentNote.polishedNote.trim() !== '') {
        this.applyCustomPromptButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Re-polish with Prompt';
        this.applyCustomPromptButton.title = 'Re-polish note with the current custom prompt and language';
    } else {
        this.applyCustomPromptButton.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Polish with Prompt';
        this.applyCustomPromptButton.title = 'Polish this transcription using the custom prompt';
    }
  }

  private async handleApplyCustomPrompt(): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (!this.userApiKey || !this.genAI) {
        this.recordingStatus.textContent = 'API Key is not set. Go to Settings to add one.';
        this.recordingStatus.className = 'status-text error';
        return;
    }
    if (!currentNote || !currentNote.rawTranscription) {
        this.recordingStatus.textContent = 'Note must have a raw transcription to polish.';
        this.recordingStatus.className = 'status-text warning';
        this.updateApplyCustomPromptButtonState();
        return;
    }

    const targetLanguage = this.outputLanguageSelect.value;
    const customPrompt = this.customPromptTextarea.value.trim();

    // Update note object with new settings for this re-polish
    currentNote.targetLanguage = targetLanguage;
    currentNote.customPolishingPrompt = customPrompt || undefined;
    
    const originalButtonText = this.applyCustomPromptButton.innerHTML;
    this.applyCustomPromptButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Polishing...';
    this.applyCustomPromptButton.disabled = true;
    this.outputLanguageSelect.disabled = true;
    this.customPromptTextarea.disabled = true;
    this.toggleCustomPromptButton.disabled = true;

    try {
        await this.getPolishedNote(currentNote.id, targetLanguage, customPrompt);
    } catch (error) {
        console.error("Error during handleApplyCustomPrompt:", error);
    } finally {
        this.applyCustomPromptButton.innerHTML = originalButtonText;
        this.updateApplyCustomPromptButtonState(); 
        this.outputLanguageSelect.disabled = false;
        this.customPromptTextarea.disabled = false;
        this.toggleCustomPromptButton.disabled = false;
    }
  }


  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, { 
        dateStyle: 'medium', 
        timeStyle: 'short' 
    });
  }

  private displayNote(noteId: string | null): void {
    if (!noteId) {
        this.createNewNote(); 
        return;
    }
    const note = this.allNotes.find(n => n.id === noteId);
    if (!note) {
      console.error(`Note with ID ${noteId} not found.`);
      this.createNewNote();
      return;
    }

    this.currentNoteId = note.id;

    this.editorTitleDiv.textContent = note.title;
    this.currentNoteTimestampDisplay.textContent = `Created: ${this.formatTimestamp(note.timestamp)}`;

    const rawPlaceholder = this.rawTranscriptionDiv.getAttribute('placeholder') || '';
    this.rawTranscriptionDiv.textContent = note.rawTranscription || rawPlaceholder;
    if (note.rawTranscription && note.rawTranscription !== rawPlaceholder) this.rawTranscriptionDiv.classList.remove('placeholder-active');
    else this.rawTranscriptionDiv.classList.add('placeholder-active');

    const polishedPlaceholder = this.polishedNoteDiv.getAttribute('placeholder') || '';
    this.polishedNoteDiv.innerHTML = note.polishedNote || polishedPlaceholder;
    if (note.polishedNote && note.polishedNote !== polishedPlaceholder) this.polishedNoteDiv.classList.remove('placeholder-active');
    else this.polishedNoteDiv.classList.add('placeholder-active');
    
    this.outputLanguageSelect.value = note.targetLanguage || 'en';
    this.customPromptTextarea.value = note.customPolishingPrompt || '';

    this.checkAndSetFocusMode();
    this.updateApplyCustomPromptButtonState();
  }
  
  private getCurrentNote(): Note | null {
    if (!this.currentNoteId) return null;
    return this.allNotes.find(n => n.id === this.currentNoteId) || null;
  }

  private async loadNotes(): Promise<void> {
    try {
      this.allNotes = await getAllNotesFromDB();
    } catch (error) {
      console.error('Error loading notes from IndexedDB:', error);
      this.allNotes = [];
    }
  }

  private async saveNote(note: Note): Promise<void> {
    if (!note) return;
    try {
        await saveNoteToDB(note);
    } catch (error) {
        console.error('Error saving note to IndexedDB:', error);
        if (this.recordingStatus) {
            this.recordingStatus.textContent = 'Error: Could not save note data.';
            this.recordingStatus.className = 'status-text error';
        }
    }
  }

  private handleResize(): void {
    if (this.isRecording && this.liveWaveformCanvas && this.liveWaveformCanvas.style.display === 'block') {
      requestAnimationFrame(() => { this.setupCanvasDimensions(); });
    }
  }

  private setupCanvasDimensions(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;
    const canvas = this.liveWaveformCanvas; const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect(); const cssWidth = rect.width; const cssHeight = rect.height;
    canvas.width = Math.round(cssWidth * dpr); canvas.height = Math.round(cssHeight * dpr);
    this.liveWaveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      this.themeToggleIcon.classList.remove('fa-sun'); this.themeToggleIcon.classList.add('fa-moon');
    } else {
      document.body.classList.remove('light-mode');
      this.themeToggleIcon.classList.remove('fa-moon'); this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private toggleTheme(): void {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
      this.themeToggleIcon.classList.remove('fa-sun'); this.themeToggleIcon.classList.add('fa-moon');
    } else {
      localStorage.setItem('theme', 'dark');
      this.themeToggleIcon.classList.remove('fa-moon'); this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private async toggleRecording(): Promise<void> {
    if (!this.userApiKey || !this.genAI) {
        this.recordingStatus.textContent = 'API Key is not set. Go to Settings to add one.';
        this.recordingStatus.className = 'status-text error';
        this.openSettingsModal();
        return;
    }
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }
  }

  private setupAudioVisualizer(): void {
    if (!this.stream || this.audioContext) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256; this.analyserNode.smoothingTimeConstant = 0.75;
    const bufferLength = this.analyserNode.frequencyBinCount;
    this.waveformDataArray = new Uint8Array(bufferLength);
    source.connect(this.analyserNode);
  }

  private drawLiveWaveform(): void {
    if (!this.analyserNode || !this.waveformDataArray || !this.liveWaveformCtx || !this.liveWaveformCanvas || !this.isRecording) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null; return;
    }
    this.waveformDrawingId = requestAnimationFrame(() => this.drawLiveWaveform());
    this.analyserNode.getByteFrequencyData(this.waveformDataArray);
    const ctx = this.liveWaveformCtx; const canvas = this.liveWaveformCanvas;
    const logicalWidth = canvas.clientWidth; const logicalHeight = canvas.clientHeight;
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    const bufferLength = this.analyserNode.frequencyBinCount; const numBars = Math.floor(bufferLength * 0.5);
    if (numBars === 0) return;
    const totalBarPlusSpacingWidth = logicalWidth / numBars;
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7));
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3));
    let x = 0;
    const recordingColor = getComputedStyle(document.documentElement).getPropertyValue('--color-recording').trim() || '#ff3b30';
    ctx.fillStyle = recordingColor;
    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break;
      const dataIndex = Math.floor(i * (bufferLength / numBars));
      const barHeightNormalized = this.waveformDataArray[dataIndex] / 255.0;
      let barHeight = barHeightNormalized * logicalHeight;
      if (barHeight < 1 && barHeight > 0) barHeight = 1; barHeight = Math.round(barHeight);
      const y = Math.round((logicalHeight - barHeight) / 2);
      ctx.fillRect(Math.floor(x), y, barWidth, barHeight);
      x += barWidth + barSpacing;
    }
  }

  private updateLiveTimer(): void {
    if (!this.isRecording || !this.liveRecordingTimerDisplay) return;
    const now = Date.now(); const elapsedMs = now - this.recordingStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10);
    this.liveRecordingTimerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  private startLiveDisplay(): void {
    if (!this.recordingInterface || !this.liveRecordingTitle || !this.liveWaveformCanvas || !this.liveRecordingTimerDisplay) return;
    this.isLiveRecordingActive = true;
    this.appContainer.classList.add('app-is-live-recording');
    this.recordingInterface.classList.add('is-live');
    this.liveRecordingTitle.style.display = 'block'; this.liveWaveformCanvas.style.display = 'block'; this.liveRecordingTimerDisplay.style.display = 'block';
    this.setupCanvasDimensions();
    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'none';
    const iconElement = this.recordButton.querySelector('.record-button-inner i') as HTMLElement;
    if (iconElement) { iconElement.classList.remove('fa-microphone'); iconElement.classList.add('fa-stop');}
    
    const currentNote = this.getCurrentNote();
    const noteTitle = currentNote?.title || 'Untitled Note';
    const placeholder = this.editorTitleDiv.getAttribute('placeholder') || 'Untitled Note';
    this.liveRecordingTitle.textContent = (noteTitle && noteTitle !== placeholder) ? noteTitle : 'New Recording';
    
    this.setupAudioVisualizer(); this.drawLiveWaveform();
    this.recordingStartTime = Date.now(); this.updateLiveTimer();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = window.setInterval(() => this.updateLiveTimer(), 50);
    this.checkAndSetFocusMode(); 
  }

  private stopLiveDisplay(): void {
    this.isLiveRecordingActive = false;
    this.appContainer.classList.remove('app-is-live-recording');
    if (!this.recordingInterface || !this.liveRecordingTitle || !this.liveWaveformCanvas || !this.liveRecordingTimerDisplay) {
      if (this.recordingInterface) this.recordingInterface.classList.remove('is-live'); 
      this.checkAndSetFocusMode();
      return;
    }
    this.recordingInterface.classList.remove('is-live');
    this.liveRecordingTitle.style.display = 'none'; this.liveWaveformCanvas.style.display = 'none'; this.liveRecordingTimerDisplay.style.display = 'none';
    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'block';
    const iconElement = this.recordButton.querySelector('.record-button-inner i') as HTMLElement;
    if (iconElement) { iconElement.classList.remove('fa-stop'); iconElement.classList.add('fa-microphone');}
    if (this.waveformDrawingId) { cancelAnimationFrame(this.waveformDrawingId); this.waveformDrawingId = null; }
    if (this.timerIntervalId) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
    if (this.liveWaveformCtx && this.liveWaveformCanvas) { this.liveWaveformCtx.clearRect(0, 0, this.liveWaveformCanvas.width, this.liveWaveformCanvas.height); }
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') { this.audioContext.close().catch(e => console.warn('Error closing audio context', e));}
      this.audioContext = null;
    }
    this.analyserNode = null; this.waveformDataArray = null;
    this.checkAndSetFocusMode(); 
  }

  private async startRecording(): Promise<void> {
    if (!this.userApiKey || !this.genAI) {
      this.recordingStatus.textContent = 'API Key is not set. Go to Settings to add one.';
      this.recordingStatus.className = 'status-text error';
      this.openSettingsModal();
      return;
    }
    const currentNote = this.getCurrentNote();
    if (!currentNote) {
      this.recordingStatus.textContent = 'Error: No current note selected. Please create a new note.';
      this.recordingStatus.className = 'status-text error';
      return;
    }

    // When starting a new recording, clear old data and update the timestamp/title
    // to reflect that this note object is now for the new recording.
    currentNote.audioBlob = undefined;
    currentNote.audioMimeType = undefined;
    currentNote.rawTranscription = '';
    currentNote.polishedNote = '';
    currentNote.timestamp = Date.now();
    currentNote.title = `Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    
    this.displayNote(currentNote.id);
    await this.saveNote(currentNote);

    this.appContainer.classList.remove('app-initial-api-focus');
    this.appContainer.classList.remove('app-focus-mode');
    this.focusPromptOverlay.classList.add('hidden');

    try {
      this.audioChunks = [];
      if (this.stream) { this.stream.getTracks().forEach(track => track.stop()); this.stream = null; }
      if (this.audioContext && this.audioContext.state !== 'closed') { await this.audioContext.close(); this.audioContext = null; }
      this.recordingStatus.textContent = 'Requesting microphone access...';
      this.recordingStatus.className = 'status-text';
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      } catch (err) {
        console.error('Failed with basic constraints:', err);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }});
      }

      if ('wakeLock' in navigator) {
        try {
          this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          this.wakeLockSentinel.addEventListener('release', () => {
            console.log('Screen Wake Lock was released automatically.');
          });
          console.log('Screen Wake Lock is active.');
        } catch (err: any) {
          console.warn(`Failed to acquire screen wake lock: ${err.name}, ${err.message}`);
        }
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      } catch (e) {
        console.warn('audio/webm not supported, trying default:', e);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      const noteIdForThisRecording = currentNote.id; 

      this.mediaRecorder.ondataavailable = event => { if (event.data && event.data.size > 0) this.audioChunks.push(event.data); };
      this.mediaRecorder.onstop = async () => {
        if (this.wakeLockSentinel) {
            await this.wakeLockSentinel.release();
            this.wakeLockSentinel = null;
            console.log('Screen Wake Lock released.');
        }

        this.stopLiveDisplay();
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          this.processAudio(audioBlob, noteIdForThisRecording).catch(err => {
            console.error('Error processing audio:', err);
            this.recordingStatus.textContent = 'Error processing recording';
            this.recordingStatus.className = 'status-text error';
            this.checkAndSetFocusMode(); 
          });
        } else { 
            this.recordingStatus.textContent = 'No audio data captured. Please try again.'; 
            this.recordingStatus.className = 'status-text warning';
            this.checkAndSetFocusMode(); 
        }
        if (this.stream) { this.stream.getTracks().forEach(track => { track.stop(); }); this.stream = null; }
      };
      this.mediaRecorder.start(); this.isRecording = true;
      this.recordButton.classList.add('recording'); this.recordButton.setAttribute('title', 'Stop Recording');
      this.startLiveDisplay();
    } catch (error) {
      console.error('Error starting recording:', error);
      
      if (this.wakeLockSentinel) {
        this.wakeLockSentinel.release().then(() => {
          this.wakeLockSentinel = null;
          console.log('Screen Wake Lock released due to recording start error.');
        });
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        this.recordingStatus.textContent = 'Microphone permission denied. Check browser settings.';
      } else if (errorName === 'NotFoundError' || (errorName === 'DOMException' && errorMessage.includes('Requested device not found'))) {
        this.recordingStatus.textContent = 'No microphone found. Please connect a microphone.';
      } else if (errorName === 'NotReadableError' || errorName === 'AbortError' || (errorName === 'DOMException' && errorMessage.includes('Failed to allocate audiosource'))) {
        this.recordingStatus.textContent = 'Cannot access microphone. It may be in use.';
      } else { this.recordingStatus.textContent = `Error: ${errorMessage}`; }
      this.recordingStatus.className = 'status-text error';
      this.isRecording = false;
      if (this.stream) { this.stream.getTracks().forEach(track => track.stop()); this.stream = null; }
      this.recordButton.classList.remove('recording'); this.recordButton.setAttribute('title', 'Start Recording');
      this.stopLiveDisplay(); 
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      try { this.mediaRecorder.stop(); } catch (e) { console.error('Error stopping MediaRecorder:', e); this.stopLiveDisplay(); }
      this.isRecording = false;
      this.recordButton.classList.remove('recording'); this.recordButton.setAttribute('title', 'Start Recording');
      this.recordingStatus.textContent = 'Processing audio...';
      this.recordingStatus.className = 'status-text';
    } else { if (!this.isRecording) this.stopLiveDisplay(); }
  }

  private async processAudio(audioBlob: Blob, noteIdToProcess: string): Promise<void> {
    const noteForProcessing = this.allNotes.find(n => n.id === noteIdToProcess);
    if (!noteForProcessing) {
        this.recordingStatus.textContent = 'Error: Original note for processing not found.';
        this.recordingStatus.className = 'status-text error';
        this.checkAndSetFocusMode();
        return;
    }
    if (audioBlob.size === 0) {
      this.recordingStatus.textContent = 'No audio data captured. Please try again.';
      this.recordingStatus.className = 'status-text warning';
      this.checkAndSetFocusMode();
      return;
    }

    try {
      noteForProcessing.audioBlob = audioBlob;
      noteForProcessing.audioMimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      await this.saveNote(noteForProcessing);

      if (this.currentNoteId === noteIdToProcess) {
        this.displayNote(noteIdToProcess);
      }

      await this.transcribeNote(noteIdToProcess);

    } catch (error) {
      console.error('Error in processAudio:', error);
      this.recordingStatus.textContent = 'Error saving recording. Please try again.';
      this.recordingStatus.className = 'status-text error';
      this.checkAndSetFocusMode();
    }
  }

  private async transcribeNote(noteId: string): Promise<void> {
    if (!this.userApiKey || !this.genAI) {
      this.recordingStatus.textContent = 'API Key is not set. Cannot transcribe audio.';
      this.recordingStatus.className = 'status-text error';
      return;
    }

    const noteToTranscribe = this.allNotes.find(n => n.id === noteId);
    if (!noteToTranscribe || !noteToTranscribe.audioBlob) {
      const errorMsg = 'Error: Note or its audio not found for transcription.';
      this.recordingStatus.textContent = errorMsg;
      this.recordingStatus.className = 'status-text error';
      console.error(errorMsg, `Note ID: ${noteId}`);
      return;
    }

    const archiveItem = document.querySelector(`.archive-item[data-note-id="${noteId}"]`);
    const transcribeButton = archiveItem?.querySelector('.transcribe-note') as HTMLButtonElement | null;
    if (transcribeButton) {
      transcribeButton.textContent = 'Transcribing...';
      transcribeButton.disabled = true;
    }

    this.recordingStatus.textContent = 'Converting audio...';
    this.recordingStatus.className = 'status-text';

    try {
      const reader = new FileReader();
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string;
            const base64Audio = base64data.split(',')[1];
            resolve(base64Audio);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(noteToTranscribe.audioBlob!);
      });

      const base64Audio = await readResult;
      if (!base64Audio) throw new Error('Failed to convert audio to base64');

      await this.getTranscription(base64Audio, noteToTranscribe.audioMimeType!, noteId);

    } catch (error) {
      console.error('Error during transcription process:', error);
      const errorMsg = 'Error processing audio for transcription.';
      this.recordingStatus.textContent = errorMsg;
      this.recordingStatus.className = 'status-text error';
      noteToTranscribe.rawTranscription = errorMsg;
      await this.saveNote(noteToTranscribe);
      
      if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
        this.renderArchiveList();
      }
      this.updateApplyCustomPromptButtonState();
    }
  }


  private formatApiErrorMessage(error: any): string {
    let displayErrorMessage = error instanceof Error ? error.message : String(error);
    const rpcErrorPrefixPattern = /^got status: \d{3} \w+\. /i;

    if (typeof displayErrorMessage === 'string' && rpcErrorPrefixPattern.test(displayErrorMessage)) {
        try {
            const jsonString = displayErrorMessage.replace(rpcErrorPrefixPattern, '');
            const parsedJson = JSON.parse(jsonString);
            if (parsedJson.error && parsedJson.error.message) {
                displayErrorMessage = `Service Error: ${parsedJson.error.message} (Code: ${parsedJson.error.code || 'N/A'})`;
            }
        } catch (parseError) {
            // console.warn('Could not parse detailed error message JSON:', parseError);
        }
    } else if (typeof displayErrorMessage === 'string' && displayErrorMessage.includes("API key not valid")) {
        displayErrorMessage = "The API Key is not valid. Please check it in Settings.";
        this.openSettingsModal();
    }
    return displayErrorMessage;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 2000,
    onRetry?: (attempt: number, error: any) => void
  ): Promise<T> {
    let attempt = 1;
    while (attempt <= retries) {
      try {
        return await fn();
      } catch (error: any) {
        if (attempt === retries) {
          throw error;
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("503") || errorMessage.toLowerCase().includes("overloaded")) {
             if (onRetry) {
                onRetry(attempt, error);
            }
            const jitter = Math.random() * 500;
            const backoffTime = delay * Math.pow(2, attempt - 1) + jitter;
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            attempt++;
        } else {
            throw error;
        }
      }
    }
    throw new Error('Retry logic failed unexpectedly.');
  }

  private async getTranscription(base64Audio: string, mimeType: string, noteId: string): Promise<void> {
    if (!this.userApiKey || !this.genAI) {
        this.recordingStatus.textContent = 'API Key not set for transcription.';
        this.recordingStatus.className = 'status-text error';
        this.checkAndSetFocusMode();
        return;
    }
    const noteForTranscription = this.allNotes.find(n => n.id === noteId);
    if (!noteForTranscription) {
        this.recordingStatus.textContent = 'Error: Note not found for transcription.';
        this.recordingStatus.className = 'status-text error';
        this.checkAndSetFocusMode();
        return;
    }

    try {
      this.recordingStatus.textContent = 'Getting transcription...';
      this.recordingStatus.className = 'status-text';
      const contents = [
        {text: 'Generate a complete, detailed transcript of this audio.'},
        {inlineData: {mimeType: mimeType, data: base64Audio}},
      ];

      const generateContentFn = () => this.genAI!.models.generateContent({ model: MODEL_NAME, contents: contents });

      const onRetryCallback = (attempt: number, error: any) => {
          console.warn(`Transcription attempt ${attempt} failed. Retrying...`, error);
          this.recordingStatus.textContent = `Model is busy. Retrying transcription... (${attempt}/3)`;
          this.recordingStatus.className = 'status-text warning';
      };
      
      const response: GenerateContentResponse = await this.retryWithBackoff(generateContentFn, 3, 2000, onRetryCallback);
      const transcriptionText = response.text; 

      if (transcriptionText) {
        noteForTranscription.rawTranscription = transcriptionText;
        await this.saveNote(noteForTranscription);

        if (this.currentNoteId === noteId) { 
            this.displayNote(noteId);
        } else {
             if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList(); 
             this.checkAndSetFocusMode();
        }
        this.updateApplyCustomPromptButtonState();

        if (this.isAutoPolishEnabled) {
          this.recordingStatus.textContent = 'Transcription complete. Polishing note...';
          this.recordingStatus.className = 'status-text';
          await this.getPolishedNote(noteId);
        } else {
          this.recordingStatus.textContent = 'Transcription complete. Auto-polish is off.';
          this.recordingStatus.className = 'status-text success';
          this.checkAndSetFocusMode();
        }
      } else {
        this.recordingStatus.textContent = 'Transcription failed or returned empty.';
        this.recordingStatus.className = 'status-text warning';
        noteForTranscription.rawTranscription = 'Could not transcribe audio. Please try again.';
        noteForTranscription.polishedNote = '<p><em>Could not transcribe audio. Please try again.</em></p>';
        await this.saveNote(noteForTranscription);
        if (this.currentNoteId === noteId) this.displayNote(noteId);
        else {
            if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
            this.checkAndSetFocusMode();
        }
        this.updateApplyCustomPromptButtonState();
      }
    } catch (error) {
      console.error('Error getting transcription:', error);
      const displayErrorMessage = this.formatApiErrorMessage(error);
      this.recordingStatus.textContent = `Error getting transcription: ${displayErrorMessage.substring(0,100)}`;
      this.recordingStatus.className = 'status-text error';
      noteForTranscription.rawTranscription = `Error during transcription: ${displayErrorMessage}`;
      noteForTranscription.polishedNote = `<p><em>Error during transcription: ${displayErrorMessage}</em></p>`;
      await this.saveNote(noteForTranscription);
      if (this.currentNoteId === noteId) this.displayNote(noteId);
      else {
          if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
          this.checkAndSetFocusMode();
      }
      this.updateApplyCustomPromptButtonState();
    }
  }

  private async getPolishedNote(noteId: string, overrideTargetLanguage?: string, overrideCustomPrompt?: string): Promise<void> {
    if (!this.userApiKey || !this.genAI) {
        this.recordingStatus.textContent = 'API Key not set for polishing.';
        this.recordingStatus.className = 'status-text error';
        this.checkAndSetFocusMode();
        return;
    }
    const noteToPolish = this.allNotes.find(n => n.id === noteId);
    if (!noteToPolish) {
        this.recordingStatus.textContent = 'Error: Note not found for polishing.';
        this.recordingStatus.className = 'status-text error';
        this.checkAndSetFocusMode();
        return;
    }

    try {
      if (!noteToPolish.rawTranscription || noteToPolish.rawTranscription.trim() === '' || noteToPolish.rawTranscription.startsWith('Error during transcription:') || noteToPolish.rawTranscription === 'Could not transcribe audio. Please try again.') {
        this.recordingStatus.textContent = 'No valid transcription to polish.';
        this.recordingStatus.className = 'status-text warning';
        noteToPolish.polishedNote = '<p><em>No valid transcription available to polish.</em></p>';
        await this.saveNote(noteToPolish);
        if (this.currentNoteId === noteId) this.displayNote(noteId);
        else {
            if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
            this.checkAndSetFocusMode();
        }
        this.updateApplyCustomPromptButtonState();
        return;
      }

      this.recordingStatus.textContent = 'Polishing note...';
      this.recordingStatus.className = 'status-text';

      const targetLanguageCode = overrideTargetLanguage || noteToPolish.targetLanguage || this.outputLanguageSelect.value;
      const customPrompt = overrideCustomPrompt !== undefined 
        ? overrideCustomPrompt 
        : ( (this.currentNoteId === noteId && !this.customPromptContainer.classList.contains('hidden') )
            ? this.customPromptTextarea.value.trim() 
            : noteToPolish.customPolishingPrompt);
      
      const targetLanguage = DEFAULT_LANGUAGES.find(l => l.code === targetLanguageCode) || DEFAULT_LANGUAGES[0];

      let promptText: string;
      if (customPrompt) {
        promptText = `You are an expert note-taking assistant.
Your task is to process a raw audio transcription.
First, mentally translate the following raw audio transcription into ${targetLanguage.name} (${targetLanguage.code}).
Then, take the ${targetLanguage.name} translation and apply the user-provided instructions below to create a polished note.
Finally, generate a concise, descriptive title for the note.

Your final output MUST be a JSON object with two keys: "title" and "note".
- The "title" should be a short, relevant subject line for the note (max 10 words).
- The "note" should contain the polished content formatted in markdown.
Do NOT include any introductory phrases, explanations, or any text outside of the JSON object.

User Instructions:
${customPrompt}

Raw transcription:
${noteToPolish.rawTranscription}`;
      } else {
        promptText = `You are an expert note-taking assistant.
Your task is to process a raw audio transcription.
First, mentally translate the following raw audio transcription into ${targetLanguage.name} (${targetLanguage.code}).
Then, take the ${targetLanguage.name} translation and perform the following to create a polished note:
- Create a polished, well-formatted note.
- Remove filler words (e.g., um, uh, like), unnecessary repetitions, and false starts.
- Correct grammar and improve sentence structure.
- Format the content logically using markdown (e.g., headings for topics, bullet/numbered lists for items).
- Ensure all original meaning and key information from the transcription are preserved.

Finally, generate a concise, descriptive title for the note based on its content.

Your final output MUST be a JSON object with two keys: "title" and "note".
- The "title" should be a short, relevant subject line for the note (max 10 words).
- The "note" should contain the polished content formatted in markdown.
Do NOT include any introductory phrases, explanations, or any text outside of the JSON object.

Raw transcription:
${noteToPolish.rawTranscription}`;
      }
      
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'A concise, descriptive title for the note, no more than 10 words.',
          },
          note: {
            type: Type.STRING,
            description: 'The full polished note content in Markdown format.',
          },
        },
        required: ['title', 'note'],
      };

      const contents = [{text: promptText}];
      
      const generateContentFn = () => this.genAI!.models.generateContent({ 
          model: MODEL_NAME, 
          contents: contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
          }
      });
      const onRetryCallback = (attempt: number, error: any) => {
          console.warn(`Polishing attempt ${attempt} failed. Retrying...`, error);
          this.recordingStatus.textContent = `Model is busy. Retrying polishing... (${attempt}/3)`;
          this.recordingStatus.className = 'status-text warning';
      };
      const response: GenerateContentResponse = await this.retryWithBackoff(generateContentFn, 3, 2000, onRetryCallback);
      const jsonResponseText = response.text; 

      if (jsonResponseText) {
        let parsedResponse: { title: string; note: string; };
        try {
            const cleanedJson = jsonResponseText.replace(/^```json\s*|```\s*$/g, '');
            parsedResponse = JSON.parse(cleanedJson);
        } catch (e) {
            console.error("Failed to parse JSON response from AI", e);
            parsedResponse = {
                note: jsonResponseText, // Fallback to raw response as note
                title: `Note from ${this.formatTimestamp(noteToPolish.timestamp)}`
            };
        }
        
        const { title, note: polishedText } = parsedResponse;

        const htmlContent = marked.parse(polishedText) as string;
        noteToPolish.polishedNote = htmlContent;
        noteToPolish.title = title.trim() || `Note from ${this.formatTimestamp(noteToPolish.timestamp)}`;
        noteToPolish.targetLanguage = targetLanguageCode; 
        noteToPolish.customPolishingPrompt = customPrompt || undefined;
        
        await this.saveNote(noteToPolish);
        if (this.currentNoteId === noteId) this.displayNote(noteId); 
        else {
            if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
            this.checkAndSetFocusMode();
        }
        this.recordingStatus.textContent = 'Note polished. Ready for next recording.';
        this.recordingStatus.className = 'status-text success';
      } else {
        this.recordingStatus.textContent = 'Polishing failed or returned empty.';
        this.recordingStatus.className = 'status-text warning';
        noteToPolish.polishedNote = '<p><em>Polishing returned empty. Raw transcription is available.</em></p>';
        await this.saveNote(noteToPolish);
        if (this.currentNoteId === noteId) this.displayNote(noteId);
        else {
            if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
            this.checkAndSetFocusMode();
        }
      }
    } catch (error) {
      console.error('Error polishing note:', error);
      const displayErrorMessage = this.formatApiErrorMessage(error);
      this.recordingStatus.textContent = `Error polishing note: ${displayErrorMessage.substring(0,100)}`;
      this.recordingStatus.className = 'status-text error';
      noteToPolish.polishedNote = `<p><em>Error during polishing: ${displayErrorMessage}</em></p>`;
      await this.saveNote(noteToPolish);
      if (this.currentNoteId === noteId) this.displayNote(noteId);
      else {
        if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
        this.checkAndSetFocusMode();
      }
    }
    this.updateApplyCustomPromptButtonState();
  }

  private async createNewNote(): Promise<void> {
    if (this.isRecording && this.mediaRecorder) {
        this.recordingStatus.textContent = 'Finalizing current recording...';
        this.recordingStatus.className = 'status-text';
        await this.stopRecording(); 
    }

    const newNote: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 
      rawTranscription: '',
      polishedNote: '',
      timestamp: Date.now(),
      targetLanguage: this.outputLanguageSelect.value || 'en',
      customPolishingPrompt: this.customPromptTextarea.value.trim() || undefined,
    };
    
    this.allNotes.push(newNote);
    this.currentNoteId = newNote.id; 
    await this.saveNote(newNote);
    this.displayNote(newNote.id);
    
    this.updateUiForApiKey(); 
    this.checkAndSetFocusMode(); 
  }

  private checkAndSetFocusMode(): void {
    if (!this.userApiKey) {
        this.appContainer.classList.add('app-initial-api-focus');
        this.appContainer.classList.remove('app-focus-mode'); 
        this.focusPromptOverlay.classList.remove('hidden');
        this.focusPromptOverlay.querySelector('.focus-prompt-text')!.innerHTML = 'Let\'s AudioWrite what\'s on your mind!';
    } else {
        this.appContainer.classList.remove('app-initial-api-focus');
        this.appContainer.classList.remove('app-focus-mode'); 
        this.focusPromptOverlay.classList.add('hidden'); 
    }
    this.updateRecordButtonGlowState();
  }


  private openArchiveModal(): void {
    this.renderArchiveList();
    this.archiveModal.classList.remove('hidden');
  }

  private closeArchiveModal(): void {
    this.archiveModal.classList.add('hidden');
  }

  private openSettingsModal(): void {
    this.updateApiKeyStatusUI();
    if (this.deferredInstallPrompt && this.installAppSection) {
        this.installAppSection.classList.remove('hidden');
    } else if (this.installAppSection) {
        this.installAppSection.classList.add('hidden');
    }
    this.settingsModal.classList.remove('hidden');
  }

  private closeSettingsModal(): void {
    this.settingsModal.classList.add('hidden');
    this.checkAndSetFocusMode();
  }


  private renderArchiveList(): void {
    if (!this.archiveListContainer) {
        console.error("Critical: Archive list container DOM element not found.");
        return;
    }
    this.archiveListContainer.innerHTML = ''; 

    const sortedNotes = this.allNotes.sort((a, b) => b.timestamp - a.timestamp);

    if (sortedNotes.length === 0) {
        this.archiveListContainer.innerHTML = '<p class="archive-empty-message" style="text-align:center; color: var(--color-text-secondary);">No saved notes yet.</p>';
        return;
    }
    
    const isApiKeySet = !!(this.userApiKey && this.genAI);

    sortedNotes.forEach(note => {
      try {
        const item = document.createElement('div');
        item.className = 'archive-item';
        item.setAttribute('data-note-id', note.id);

        const noteTitle = note.title || 'Untitled Note';
        const noteTimestamp = typeof note.timestamp === 'number' ? this.formatTimestamp(note.timestamp) : 'N/A';
        const noteTargetLanguage = note.targetLanguage || 'en';
        const langName = DEFAULT_LANGUAGES.find(l => l.code === noteTargetLanguage)?.name || noteTargetLanguage;
        
        let audioPlayerHtml = '';
        if (note.audioBlob && note.audioMimeType) {
          const audioSrc = URL.createObjectURL(note.audioBlob);
          audioPlayerHtml = `<div class="archive-item-audio-player"><audio controls src="${audioSrc}"></audio></div>`;
        } else {
          audioPlayerHtml = `<p class="archive-item-no-audio"><em>No audio recorded for this note.</em></p>`;
        }

        const rawTranscriptionText = note.rawTranscription || '';
        const rawSnippet = rawTranscriptionText.substring(0, 100) + (rawTranscriptionText.length > 100 ? '...' : '');
        
        const polishedNoteText = (note.polishedNote || '').replace(/<[^>]*>?/gm, ''); 
        const polishedSnippet = polishedNoteText.substring(0,100) + (polishedNoteText.length > 100 ? '...' : '');

        const hasAudio = !!note.audioBlob;
        const hasValidTranscription = rawTranscriptionText && !rawTranscriptionText.startsWith('Error') && rawTranscriptionText.trim() !== '' && rawTranscriptionText !== 'Could not transcribe audio. Please try again.';
        const canProcess = isApiKeySet && hasAudio;

        let processActionsHtml = '';
        if (canProcess) {
            if (hasValidTranscription) {
                processActionsHtml = `
                    <select class="repolish-language"></select>
                    <button class="action-button-small repolish-note" title="Re-polish this note with selected language and its stored custom prompt">Re-polish</button>
                `;
            } else {
                processActionsHtml = `
                    <button class="action-button-small transcribe-note" title="Transcribe the audio for this note">Transcribe</button>
                `;
            }
        } else {
            const reason = hasAudio ? 'API Key Needed' : 'No Audio';
            processActionsHtml = `<button class="action-button-small" title="${reason}" disabled>${hasAudio ? 'Process' : 'No Audio'}</button>`;
        }


        item.innerHTML = `
          <div class="archive-item-header">
            <span class="archive-item-title">${noteTitle}</span>
            <span class="archive-item-timestamp">${noteTimestamp}</span>
          </div>
          ${audioPlayerHtml}
          <div class="archive-item-content">
            <p><strong>Raw Transcription:</strong> ${rawSnippet || '<em>Empty</em>'}</p>
            <p><strong>Polished Note (${langName}):</strong> ${polishedSnippet || '<em>Empty</em>'}</p>
          </div>
          <div class="archive-item-actions">
            <button class="action-button-small load-note" title="Load to Editor">Load</button>
            ${processActionsHtml}
            <button class="action-button-small danger delete-note" title="Delete Note">Delete</button>
          </div>
        `;

        item.querySelector('.load-note')?.addEventListener('click', () => this.loadNoteIntoEditor(note.id));
        item.querySelector('.delete-note')?.addEventListener('click', () => this.deleteNote(note.id));

        if (canProcess && hasValidTranscription) {
            const langSelect = item.querySelector('.repolish-language') as HTMLSelectElement;
            const repolishButton = item.querySelector('.repolish-note') as HTMLButtonElement;
            if (langSelect && repolishButton) {
                DEFAULT_LANGUAGES.forEach(lang => {
                  const option = document.createElement('option');
                  option.value = lang.code;
                  option.textContent = lang.name;
                  langSelect.appendChild(option);
                });
                langSelect.value = noteTargetLanguage;
                
                repolishButton.addEventListener('click', async () => {
                  const newLang = langSelect.value;
                  const customPromptForRepolish = note.customPolishingPrompt; 
                  
                  this.recordingStatus.textContent = `Re-polishing "${noteTitle}"...`;
                  this.recordingStatus.className = 'status-text';
                  repolishButton.textContent = 'Polishing...';
                  repolishButton.disabled = true;
                  langSelect.disabled = true;
                  
                  await this.getPolishedNote(note.id, newLang, customPromptForRepolish);
                  
                  this.renderArchiveList(); 
                  if (this.currentNoteId === note.id) {
                      this.displayNote(note.id);
                  }
                });
            }
        } else if (canProcess && !hasValidTranscription) {
            const transcribeButton = item.querySelector('.transcribe-note') as HTMLButtonElement;
            if (transcribeButton) {
                transcribeButton.addEventListener('click', () => {
                    this.transcribeNote(note.id);
                });
            }
        }

        this.archiveListContainer.appendChild(item);
      } catch (error) {
        console.error('Error rendering archive item for note ID:', (note ? note.id : 'unknown'), error);
        const errorItem = document.createElement('div');
        errorItem.className = 'archive-item archive-item-error'; 
        errorItem.textContent = `Error displaying note: ${(note ? note.title || note.id : 'Unknown Note')}. See console for details.`;
        this.archiveListContainer.appendChild(errorItem);
      }
    });
  }

  private async copyContent(type: 'polished' | 'raw'): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (!currentNote) {
        this.recordingStatus.textContent = 'No active note to copy from.';
        this.recordingStatus.className = 'status-text warning';
        return;
    }

    let textToCopy: string | null = null;
    let buttonToUpdate: HTMLButtonElement | null = null;
    let originalButtonHTML = '';

    const rawPlaceholder = this.rawTranscriptionDiv.getAttribute('placeholder') || '';
    const polishedPlaceholder = this.polishedNoteDiv.getAttribute('placeholder') || '';

    if (type === 'polished') {
      textToCopy = this.polishedNoteDiv.innerText;
      buttonToUpdate = this.copyPolishedNoteButton;
      originalButtonHTML = '<i class="fas fa-copy"></i> Copy Polished';
      if (textToCopy === polishedPlaceholder) textToCopy = '';
    } else {
      textToCopy = this.rawTranscriptionDiv.textContent;
      buttonToUpdate = this.copyRawTranscriptionButton;
      originalButtonHTML = '<i class="fas fa-copy"></i> Copy Raw';
      if (textToCopy === rawPlaceholder) textToCopy = '';
    }

    if (textToCopy && textToCopy.trim() !== '') {
      try {
        await navigator.clipboard.writeText(textToCopy.trim());
        if (buttonToUpdate) {
          buttonToUpdate.innerHTML = '<i class="fas fa-check"></i> Copied!';
          buttonToUpdate.disabled = true;
          setTimeout(() => {
            buttonToUpdate.innerHTML = originalButtonHTML;
            buttonToUpdate.disabled = false;
          }, 2000);
        }
        this.recordingStatus.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} content copied!`;
        this.recordingStatus.className = 'status-text success';
      } catch (err) {
        console.error('Failed to copy text: ', err);
        if (buttonToUpdate) {
          buttonToUpdate.innerHTML = '<i class="fas fa-times"></i> Failed';
          setTimeout(() => {
            buttonToUpdate.innerHTML = originalButtonHTML;
          }, 2000);
        }
        this.recordingStatus.textContent = 'Failed to copy to clipboard.';
        this.recordingStatus.className = 'status-text error';
      }
    } else {
        this.recordingStatus.textContent = `Nothing to copy from ${type} content.`;
        this.recordingStatus.className = 'status-text warning';
         if (buttonToUpdate) {
          buttonToUpdate.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Empty';
          setTimeout(() => {
            buttonToUpdate.innerHTML = originalButtonHTML;
          }, 2000);
        }
    }
  }

  private loadNoteIntoEditor(noteId: string): void {
    this.currentNoteId = noteId;
    this.displayNote(noteId); 
    this.closeArchiveModal();
  }

  private async deleteNote(noteId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this note? This cannot be undone.')) return;

    await deleteNoteFromDB(noteId);
    this.allNotes = this.allNotes.filter(n => n.id !== noteId);
    this.renderArchiveList(); 

    if (this.currentNoteId === noteId) { 
      if (this.allNotes.length > 0) {
        this.loadNoteIntoEditor(this.allNotes.sort((a,b) => b.timestamp - a.timestamp)[0].id); 
      } else {
        await this.createNewNote(); 
      }
    }
     this.checkAndSetFocusMode(); 
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceNotesApp();

  document.querySelectorAll<HTMLElement>('[contenteditable][placeholder]').forEach(el => {
    const placeholder = el.getAttribute('placeholder')!;
    
    function updatePlaceholderState() {
        const isPolishedNoteDiv = el.id === 'polishedNote';
        const currentText = (isPolishedNoteDiv ? el.innerHTML : el.textContent)?.trim();

        if (currentText === '' || (currentText === placeholder && !isPolishedNoteDiv) || (isPolishedNoteDiv && el.innerHTML === placeholder)) {
            if (currentText === '') { 
                if (isPolishedNoteDiv) el.innerHTML = placeholder;
                else el.textContent = placeholder;
            }
            el.classList.add('placeholder-active');
        } else {
            el.classList.remove('placeholder-active');
        }
    }

    updatePlaceholderState(); 

    el.addEventListener('focus', function() {
        const isPolishedNoteDiv = this.id === 'polishedNote';
        const currentContent = isPolishedNoteDiv ? this.innerHTML : this.textContent;
        if (currentContent?.trim() === placeholder) {
            if (isPolishedNoteDiv) this.innerHTML = '';
            else this.textContent = '';
            this.classList.remove('placeholder-active');
        }
    });

    el.addEventListener('blur', function() {
        updatePlaceholderState();
    });
  });
});

export {};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {GoogleGenAI, GenerateContentResponse} from '@google/genai';
import {marked} from 'marked';

const MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const LOCAL_STORAGE_KEY = 'voiceNotesApp_notes';
const SESSION_STORAGE_API_KEY = 'voiceNotesApp_apiKey';
const SESSION_STORAGE_IOS_A2HS_DISMISSED = 'voiceNotesApp_iosA2HSDismissed';
const SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE = 'voiceNotesApp_initialApiSetupComplete';


interface Note {
  id: string;
  title: string;
  rawTranscription: string;
  polishedNote: string;
  timestamp: number;
  audioBlobBase64?: string;
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
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;

  private outputLanguageSelect: HTMLSelectElement;
  private toggleCustomPromptButton: HTMLButtonElement;
  private customPromptContainer: HTMLDivElement;
  private customPromptTextarea: HTMLTextAreaElement;
  private applyCustomPromptButton: HTMLButtonElement;
  
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
  private isInitialApiKeyFocusActive = false;

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

    this.initializeApiKey();
    this.populateLanguageDropdown();
    this.bindEventListeners();
    this.initTheme();
    this.initializePWAInstallHandlers();
    this.loadNotes();

    if (!this.userApiKey && !sessionStorage.getItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE)) {
        this.activateInitialApiKeyFocus();
    } else {
        this.checkAndSetFocusMode(); 
    }
    
    if (this.allNotes.length === 0) {
      this.createNewNote(); 
    } else {
      const lastNote = this.allNotes.sort((a,b) => b.timestamp - a.timestamp)[0];
      this.loadNoteIntoEditor(lastNote.id); 
    }
    
    this.updateApiKeyStatusUI();
    this.updateApplyCustomPromptButtonState(); 
  }

  private initializeApiKey(): void {
    const storedApiKey = sessionStorage.getItem(SESSION_STORAGE_API_KEY);
    if (storedApiKey) {
      this.userApiKey = storedApiKey;
      try {
        this.genAI = new GoogleGenAI({ apiKey: this.userApiKey });
        if(this.apiKeyInput) this.apiKeyInput.value = this.userApiKey;
      } catch (error) {
        console.error("Failed to initialize GoogleGenAI with stored API key:", error);
        this.genAI = null;
        this.userApiKey = null;
        sessionStorage.removeItem(SESSION_STORAGE_API_KEY); 
        sessionStorage.removeItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE);
      }
    } else {
      this.genAI = null;
    }
  }

  private setApiKey(apiKey: string): void {
    if (!apiKey.trim()) {
      this.userApiKey = null;
      this.genAI = null;
      sessionStorage.removeItem(SESSION_STORAGE_API_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE); 
      this.updateApiKeyStatusUI("API Key cleared. Please enter a valid key to use AI features.", "warning");
      if (!sessionStorage.getItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE)) {
        this.activateInitialApiKeyFocus();
      } else {
        this.checkAndSetFocusMode(); 
      }
      this.updateApplyCustomPromptButtonState();
      return;
    }
    try {
      const testGenAI = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.genAI = testGenAI;
      this.userApiKey = apiKey.trim();
      sessionStorage.setItem(SESSION_STORAGE_API_KEY, this.userApiKey);
      
      if (!sessionStorage.getItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE)) {
          sessionStorage.setItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE, 'true');
      }
      if (this.isInitialApiKeyFocusActive) {
          this.deactivateInitialApiKeyFocus();
      }
      
      this.updateApiKeyStatusUI("API Key saved and applied for this session.", "success");
      this.closeSettingsModal(); 
    } catch (error) {
      console.error("Error initializing GoogleGenAI with new API key:", error);
      this.genAI = null; 
      this.userApiKey = null; 
      sessionStorage.removeItem(SESSION_STORAGE_API_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE); 
      this.updateApiKeyStatusUI("Invalid API Key format or other initialization error. Please check your key.", "error");
      if (!this.isInitialApiKeyFocusActive) {
          this.activateInitialApiKeyFocus(); 
      }
    }
    this.updateApplyCustomPromptButtonState();
  }

  private updateApiKeyStatusUI(message?: string, type?: 'success' | 'error' | 'warning' | 'info'): void {
    if (this.apiKeyStatus) {
        if (message && type) {
            this.apiKeyStatus.textContent = message;
            this.apiKeyStatus.className = `api-key-status ${type}`;
        } else {
            if (this.userApiKey && this.genAI) {
                this.apiKeyStatus.textContent = 'API Key is set for this session.';
                this.apiKeyStatus.className = 'api-key-status success';
            } else {
                this.apiKeyStatus.textContent = 'API Key not set. AI features are disabled.';
                this.apiKeyStatus.className = 'api-key-status warning';
            }
        }
    }
    if (this.recordingStatus && !this.isRecording && !this.isLiveRecordingActive && !this.isInitialApiKeyFocusActive) { 
        if (!this.genAI || !this.userApiKey) {
            this.recordingStatus.innerHTML = 'API Key needed for AI features. <button id="openSettingsFromStatus" class="text-button">Set Key</button>';
            this.recordingStatus.className = 'status-text warning';
            const openSettingsBtn = document.getElementById('openSettingsFromStatus');
            if (openSettingsBtn) {
                openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
            }
        } else {
            this.recordingStatus.textContent = 'Ready to record';
            this.recordingStatus.className = 'status-text';
        }
    } else if (this.isInitialApiKeyFocusActive && this.recordingStatus) {
        this.recordingStatus.textContent = 'Please set your API Key to begin.';
        this.recordingStatus.className = 'status-text info';
    }
    
    this.recordButton.disabled = !this.genAI || !this.userApiKey;
    
    if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
        this.renderArchiveList();
    }
    this.updateRecordButtonGlowState();
    this.updateApplyCustomPromptButtonState();
  }

  private activateInitialApiKeyFocus(): void {
    if (this.isInitialApiKeyFocusActive) return;
    this.isInitialApiKeyFocusActive = true;
    this.appContainer.classList.add('app-initial-api-focus');
    this.focusPromptOverlay.classList.remove('hidden');
    this.updateApiKeyStatusUI(); 
    this.updateRecordButtonGlowState();
  }

  private deactivateInitialApiKeyFocus(): void {
    if (!this.isInitialApiKeyFocusActive) return;
    this.isInitialApiKeyFocusActive = false;
    this.appContainer.classList.remove('app-initial-api-focus');
    this.focusPromptOverlay.classList.add('hidden');
    this.updateApiKeyStatusUI(); 
    this.checkAndSetFocusMode(); 
  }

  private updateRecordButtonGlowState(): void {
    const isApiKeySet = !!(this.genAI && this.userApiKey);
    const isIdle = !this.isRecording && !this.isLiveRecordingActive;
    const currentNote = this.getCurrentNote();
    const isNoteEmpty = !currentNote || 
                        (!currentNote.audioBlobBase64 && 
                         !currentNote.rawTranscription && 
                         !currentNote.polishedNote);

    if (this.settingsButton) {
        if ((this.isInitialApiKeyFocusActive && !isApiKeySet) || (!isApiKeySet && isIdle && !this.isInitialApiKeyFocusActive)) {
          this.settingsButton.classList.add('settings-needs-glow');
        } else {
          this.settingsButton.classList.remove('settings-needs-glow');
        }
    }
    
    if (this.recordButton) {
        if (isApiKeySet && isIdle && isNoteEmpty && !this.isInitialApiKeyFocusActive) {
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
    this.editorTitleDiv.addEventListener('blur', () => this.handleTitleChange());

    this.archiveButton.addEventListener('click', () => this.openArchiveModal());
    this.closeArchiveModalButton.addEventListener('click', () => this.closeArchiveModal());

    this.settingsButton.addEventListener('click', () => this.openSettingsModal());
    this.closeSettingsModalButton.addEventListener('click', () => this.closeSettingsModal());
    this.saveApiKeyButton.addEventListener('click', () => this.setApiKey(this.apiKeyInput.value));

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


  private handleTitleChange(): void {
    const currentNote = this.getCurrentNote();
    if (currentNote && this.editorTitleDiv.textContent !== currentNote.title) {
        currentNote.title = this.editorTitleDiv.textContent || 'Untitled Note';
        this.saveNotes();
        if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) {
            this.renderArchiveList();
        }
    }
  }

  private handleContentEditableChange(type: 'rawTranscription' | 'polishedNote'): void {
    const currentNote = this.getCurrentNote();
    if (!currentNote) return;

    const div = type === 'rawTranscription' ? this.rawTranscriptionDiv : this.polishedNoteDiv;
    const currentText = div.id === 'polishedNote' ? div.innerHTML : div.textContent || ''; 
    
    if (type === 'rawTranscription' && currentText !== currentNote.rawTranscription) {
        currentNote.rawTranscription = currentText;
    } else if (type === 'polishedNote' && currentText !== currentNote.polishedNote) {
        currentNote.polishedNote = currentText; 
    } else {
        return; 
    }
    this.saveNotes();
    this.checkAndSetFocusMode(); 
    this.updateApplyCustomPromptButtonState(); // Raw transcription might have changed
  }

  private handleOutputLanguageChange(): void {
    const currentNote = this.getCurrentNote();
    if (currentNote) {
      currentNote.targetLanguage = this.outputLanguageSelect.value;
      this.saveNotes();
      // No direct re-polish, user must click "Apply & Re-polish"
    }
  }

  private toggleCustomPromptDisplay(): void {
    this.customPromptContainer.classList.toggle('hidden');
    this.applyCustomPromptButton.classList.toggle('hidden', this.customPromptContainer.classList.contains('hidden'));

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
  
  private handleCustomPromptChange(): void {
    const currentNote = this.getCurrentNote();
    if (currentNote) {
        currentNote.customPolishingPrompt = this.customPromptTextarea.value.trim() || undefined;
        this.saveNotes();
        // No direct re-polish, user must click "Apply & Re-polish"
    }
  }

  private updateApplyCustomPromptButtonState(): void {
    const currentNote = this.getCurrentNote();
    const isCustomPromptSectionVisible = !this.customPromptContainer.classList.contains('hidden');
    
    // Ensure visibility is managed by toggleCustomPromptDisplay for the button too
    // this.applyCustomPromptButton.classList.toggle('hidden', !isCustomPromptSectionVisible);

    const canRepolish = !!(
        this.genAI &&
        this.userApiKey &&
        currentNote &&
        currentNote.audioBlobBase64 && // Requires audio
        currentNote.rawTranscription && // Requires raw transcription to be present
        isCustomPromptSectionVisible // Button is only active if its section is visible
    );
    this.applyCustomPromptButton.disabled = !canRepolish;
  }

  private async handleApplyCustomPrompt(): Promise<void> {
    const currentNote = this.getCurrentNote();
    if (!this.genAI || !this.userApiKey) {
        this.updateApiKeyStatusUI("API Key needed to re-polish.", "warning");
        this.openSettingsModal();
        return;
    }
    if (!currentNote || !currentNote.audioBlobBase64 || !currentNote.rawTranscription) {
        this.recordingStatus.textContent = 'Note must have audio and raw transcription to re-polish.';
        this.recordingStatus.className = 'status-text warning';
        this.updateApplyCustomPromptButtonState();
        return;
    }

    const targetLanguage = this.outputLanguageSelect.value;
    const customPrompt = this.customPromptTextarea.value.trim();

    // Update note object with new settings for this re-polish
    currentNote.targetLanguage = targetLanguage;
    currentNote.customPolishingPrompt = customPrompt || undefined;
    // saveNotes() will be called by getPolishedNote

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
        // getPolishedNote already sets recordingStatus and saves note on error
    } finally {
        this.applyCustomPromptButton.innerHTML = originalButtonText;
        // updateApplyCustomPromptButtonState will be called by displayNote if successful,
        // or here if error occurs before displayNote
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
    // Do not automatically show/hide custom prompt section here, let user control it.
    // this.customPromptContainer.classList.toggle('hidden', !note.customPolishingPrompt);

    this.checkAndSetFocusMode();
    this.updateApplyCustomPromptButtonState();
  }
  
  private getCurrentNote(): Note | null {
    if (!this.currentNoteId) return null;
    return this.allNotes.find(n => n.id === this.currentNoteId) || null;
  }

  private loadNotes(): void {
    const storedNotes = localStorage.getItem(LOCAL_STORAGE_KEY);
    this.allNotes = []; 

    if (storedNotes) {
      try {
        let parsedData = JSON.parse(storedNotes);
        if (Array.isArray(parsedData)) {
          this.allNotes = parsedData.filter(note =>
            note &&
            typeof note === 'object' &&
            typeof note.id === 'string' &&
            typeof note.title === 'string' && 
            typeof note.rawTranscription === 'string' && 
            typeof note.polishedNote === 'string' && 
            typeof note.timestamp === 'number' && 
            typeof note.targetLanguage === 'string' 
          );
        }
      } catch (error) {
        console.error('Error parsing notes from localStorage:', error);
      }
    }
  }

  private saveNotes(): void {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.allNotes));
    } catch (error) {
        console.error('Error saving notes to localStorage:', error);
        if (this.recordingStatus) {
            this.recordingStatus.textContent = 'Error: Could not save note data. Storage might be full.';
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
    if (!this.genAI || !this.userApiKey) {
        this.updateApiKeyStatusUI(); 
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
    if (!this.genAI || !this.userApiKey) { 
      this.updateApiKeyStatusUI();
      this.openSettingsModal();
      return;
    }
    const currentNote = this.getCurrentNote();
    if (!currentNote) {
        this.recordingStatus.textContent = 'Error: No current note selected. Please create a new note.';
        this.recordingStatus.className = 'status-text error';
        return;
    }
    currentNote.audioBlobBase64 = undefined;
    currentNote.audioMimeType = undefined;
    currentNote.rawTranscription = ''; 
    currentNote.polishedNote = '';
    this.displayNote(currentNote.id); // This will call updateApplyCustomPromptButtonState

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
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
      } catch (e) {
        console.warn('audio/webm not supported, trying default:', e);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      const noteIdForThisRecording = currentNote.id; 

      this.mediaRecorder.ondataavailable = event => { if (event.data && event.data.size > 0) this.audioChunks.push(event.data); };
      this.mediaRecorder.onstop = () => {
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
    if (!this.genAI) {
        this.recordingStatus.textContent = 'API Key not set. Cannot process audio.';
        this.recordingStatus.className = 'status-text warning';
        this.openSettingsModal();
        this.checkAndSetFocusMode();
        return;
    }
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
      URL.createObjectURL(audioBlob); 
      this.recordingStatus.textContent = 'Converting audio...';
      this.recordingStatus.className = 'status-text';
      const reader = new FileReader();
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string; const base64Audio = base64data.split(',')[1];
            resolve(base64Audio);
          } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await readResult;
      if (!base64Audio) throw new Error('Failed to convert audio to base64');
      
      noteForProcessing.audioBlobBase64 = base64Audio;
      noteForProcessing.audioMimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      this.saveNotes();
      
      if (this.currentNoteId === noteIdToProcess) {
        this.displayNote(noteIdToProcess); // This will update button states
      } else {
        this.checkAndSetFocusMode(); 
        this.updateApplyCustomPromptButtonState(); // In case current note changed
      }

      await this.getTranscription(base64Audio, noteForProcessing.audioMimeType, noteIdToProcess);
    } catch (error) {
      console.error('Error in processAudio:', error);
      this.recordingStatus.textContent = 'Error processing recording. Please try again.';
      this.recordingStatus.className = 'status-text error';
      this.checkAndSetFocusMode();
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
        displayErrorMessage = "API Key not valid. Please check your key in Settings.";
        this.openSettingsModal();
    }
    return displayErrorMessage;
  }

  private async getTranscription(base64Audio: string, mimeType: string, noteId: string): Promise<void> {
    if (!this.genAI) {
        this.recordingStatus.textContent = 'API Key not set for transcription.';
        this.recordingStatus.className = 'status-text warning';
        this.checkAndSetFocusMode();
        this.openSettingsModal();
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
      const response: GenerateContentResponse = await this.genAI.models.generateContent({ model: MODEL_NAME, contents: contents });
      const transcriptionText = response.text; 

      if (transcriptionText) {
        noteForTranscription.rawTranscription = transcriptionText;
        this.saveNotes();
        if (this.currentNoteId === noteId) { 
            this.displayNote(noteId); // This will update button states
        } else {
             if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList(); 
             this.checkAndSetFocusMode();
             this.updateApplyCustomPromptButtonState(); // In case current note changed
        }
        this.recordingStatus.textContent = 'Transcription complete. Polishing note...';
        this.recordingStatus.className = 'status-text';
        await this.getPolishedNote(noteId);
      } else {
        this.recordingStatus.textContent = 'Transcription failed or returned empty.';
        this.recordingStatus.className = 'status-text warning';
        noteForTranscription.rawTranscription = 'Could not transcribe audio. Please try again.';
        noteForTranscription.polishedNote = '<p><em>Could not transcribe audio. Please try again.</em></p>';
        this.saveNotes();
        if (this.currentNoteId === noteId) this.displayNote(noteId);
        else {
            if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
            this.checkAndSetFocusMode();
        }
        this.updateApplyCustomPromptButtonState(); // Update state after attempting transcription
      }
    } catch (error) {
      console.error('Error getting transcription:', error);
      const displayErrorMessage = this.formatApiErrorMessage(error);
      this.recordingStatus.textContent = `Error getting transcription: ${displayErrorMessage.substring(0,100)}`;
      this.recordingStatus.className = 'status-text error';
      noteForTranscription.rawTranscription = `Error during transcription: ${displayErrorMessage}`;
      noteForTranscription.polishedNote = `<p><em>Error during transcription: ${displayErrorMessage}</em></p>`;
      this.saveNotes();
      if (this.currentNoteId === noteId) this.displayNote(noteId);
      else {
          if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
          this.checkAndSetFocusMode();
      }
      this.updateApplyCustomPromptButtonState(); // Update state after error
    }
  }

  private async getPolishedNote(noteId: string, overrideTargetLanguage?: string, overrideCustomPrompt?: string): Promise<void> {
    if (!this.genAI) {
        this.recordingStatus.textContent = 'API Key not set for polishing.';
        this.recordingStatus.className = 'status-text warning';
        this.checkAndSetFocusMode();
        this.openSettingsModal();
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
        this.saveNotes();
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
      
      // When called from handleApplyCustomPrompt, overrideCustomPrompt will be the current textarea value.
      // Otherwise, it falls back to the note's stored prompt or current editor's prompt if it's the active note.
      const customPrompt = overrideCustomPrompt !== undefined 
        ? overrideCustomPrompt 
        : ( (this.currentNoteId === noteId && !this.customPromptContainer.classList.contains('hidden') ) // if editor prompt is visible for current note
            ? this.customPromptTextarea.value.trim() 
            : noteToPolish.customPolishingPrompt);
      
      const targetLanguage = DEFAULT_LANGUAGES.find(l => l.code === targetLanguageCode) || DEFAULT_LANGUAGES[0];

      let promptText: string;
      if (customPrompt) {
        promptText = `You are an expert note-taking assistant.
First, mentally translate the following raw audio transcription into ${targetLanguage.name} (${targetLanguage.code}).
Then, take the ${targetLanguage.name} translation and apply the user-provided instructions below.
Your final output MUST ONLY be the polished note in ${targetLanguage.name}, formatted in markdown.
Do NOT include any introductory phrases, explanations, or any text other than the requested note itself.

User Instructions:
${customPrompt}

Raw transcription:
${noteToPolish.rawTranscription}`;
      } else {
        promptText = `You are an expert note-taking assistant.
First, mentally translate the following raw audio transcription into ${targetLanguage.name} (${targetLanguage.code}).
Then, take the ${targetLanguage.name} translation and perform the following:
- Create a polished, well-formatted note.
- Remove filler words (e.g., um, uh, like), unnecessary repetitions, and false starts.
- Correct grammar and improve sentence structure.
- Format the content logically using markdown (e.g., headings for topics, bullet/numbered lists for items).
- Ensure all original meaning and key information from the transcription are preserved.
Your final output MUST ONLY be the polished note in ${targetLanguage.name}, formatted in markdown.
Do NOT include any introductory phrases, explanations, or any text other than the requested note itself.

Raw transcription:
${noteToPolish.rawTranscription}`;
      }
      
      const contents = [{text: promptText}];
      const response: GenerateContentResponse = await this.genAI.models.generateContent({ model: MODEL_NAME, contents: contents });
      const polishedText = response.text; 

      if (polishedText) {
        const htmlContent = marked.parse(polishedText) as string;
        noteToPolish.polishedNote = htmlContent;
        noteToPolish.targetLanguage = targetLanguageCode; 
        noteToPolish.customPolishingPrompt = customPrompt || undefined; // Save the used prompt

        if (this.currentNoteId === noteId && !overrideTargetLanguage && !overrideCustomPrompt) { // Only auto-title on initial processing, not re-polish
            let noteTitleSet = false;
            const lines = polishedText.split('\n').map((l) => l.trim());
            for (const line of lines) {
              if (line.startsWith('#')) {
                const title = line.replace(/^#+\s+/, '').trim();
                if (title) { noteToPolish.title = title; noteTitleSet = true; break;}
              }
            }
            if (!noteTitleSet) {
              for (const line of lines) {
                if (line.length > 0) {
                  let potentialTitle = line.replace(/^[\*_\`#\->\s\[\]\(.\d)]+/, '').replace(/[\*_\`#]+$/, '').trim();
                  if (potentialTitle.length > 3) {
                    const maxLength = 60;
                    noteToPolish.title = potentialTitle.substring(0, maxLength) + (potentialTitle.length > maxLength ? '...' : '');
                    noteTitleSet = true; break;
                  }
                }
              }
            }
            if (!noteTitleSet && (noteToPolish.title.startsWith('Note ') || noteToPolish.title === this.editorTitleDiv.getAttribute('placeholder'))) { 
                noteToPolish.title = `Note from ${this.formatTimestamp(noteToPolish.timestamp)}`;
            }
        }
        
        this.saveNotes();
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
        this.saveNotes();
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
      this.saveNotes();
      if (this.currentNoteId === noteId) this.displayNote(noteId);
      else {
        if (this.archiveModal && !this.archiveModal.classList.contains('hidden')) this.renderArchiveList();
        this.checkAndSetFocusMode();
      }
    }
    this.updateApplyCustomPromptButtonState(); // Ensure button state is correct after polishing attempt
  }

  private async createNewNote(): Promise<void> {
    if (this.isRecording && this.mediaRecorder) {
        this.recordingStatus.textContent = 'Finalizing current recording...';
        this.recordingStatus.className = 'status-text';
        await this.stopRecording(); 
    }

    if (!Array.isArray(this.allNotes)) {
        console.warn("CRITICAL: this.allNotes is not an array before push in createNewNote! Attempting recovery.");
        this.allNotes = []; 
        this.loadNotes(); 
        if (!Array.isArray(this.allNotes)) { 
             console.error("CRITICAL: Recovery failed. Resetting allNotes to empty array.");
             this.allNotes = [];
        }
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
    this.saveNotes();
    this.displayNote(newNote.id); // This will call updateApplyCustomPromptButtonState
    
    this.updateApiKeyStatusUI(); 
    this.checkAndSetFocusMode(); 
  }

  private checkAndSetFocusMode(): void {
    if (this.isInitialApiKeyFocusActive) {
        this.focusPromptOverlay.classList.remove('hidden');
        this.appContainer.classList.add('app-initial-api-focus');
        this.updateRecordButtonGlowState();
        return;
    }

    this.appContainer.classList.remove('app-initial-api-focus');
    this.appContainer.classList.remove('app-focus-mode'); 
    this.focusPromptOverlay.classList.add('hidden'); 

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
    if (this.userApiKey) this.apiKeyInput.value = this.userApiKey;
    if (this.deferredInstallPrompt && this.installAppSection) {
        this.installAppSection.classList.remove('hidden');
    } else if (this.installAppSection) {
        this.installAppSection.classList.add('hidden');
    }
    this.updateApiKeyStatusUI(); 
    this.settingsModal.classList.remove('hidden');
  }

  private closeSettingsModal(): void {
    this.settingsModal.classList.add('hidden');
    this.updateApiKeyStatusUI(); 
    
    if (!this.userApiKey && !sessionStorage.getItem(SESSION_STORAGE_INITIAL_API_SETUP_COMPLETE)) {
        if (!this.isInitialApiKeyFocusActive) { 
          this.activateInitialApiKeyFocus();
        }
    } else if (this.isInitialApiKeyFocusActive && this.userApiKey) {
        this.deactivateInitialApiKeyFocus();
    } else {
        this.checkAndSetFocusMode(); 
    }
  }


  private renderArchiveList(): void {
    if (!this.archiveListContainer) {
        console.error("Critical: Archive list container DOM element not found.");
        return;
    }
    this.archiveListContainer.innerHTML = ''; 

    const validNotes = (Array.isArray(this.allNotes) ? this.allNotes : [])
        .filter(note => 
            note && 
            typeof note === 'object' && 
            typeof note.id === 'string' &&
            note.hasOwnProperty('title') && 
            note.hasOwnProperty('timestamp')
        );
    
    const sortedNotes = validNotes.sort((a, b) => {
        const tsA = typeof a.timestamp === 'number' ? a.timestamp : 0;
        const tsB = typeof b.timestamp === 'number' ? b.timestamp : 0;
        return tsB - tsA;
    });

    if (sortedNotes.length === 0) {
        this.archiveListContainer.innerHTML = '<p class="archive-empty-message" style="text-align:center; color: var(--color-text-secondary);">No saved notes yet.</p>';
        return;
    }
    
    const isApiKeySet = !!(this.genAI && this.userApiKey);

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
        if (note.audioBlobBase64 && note.audioMimeType) {
          const audioSrc = `data:${note.audioMimeType};base64,${note.audioBlobBase64}`;
          audioPlayerHtml = `<div class="archive-item-audio-player"><audio controls src="${audioSrc}"></audio></div>`;
        } else {
          audioPlayerHtml = `<p class="archive-item-no-audio"><em>No audio recorded for this note.</em></p>`;
        }

        const rawTranscriptionText = note.rawTranscription || '';
        const rawSnippet = rawTranscriptionText.substring(0, 100) + (rawTranscriptionText.length > 100 ? '...' : '');
        
        const polishedNoteText = (note.polishedNote || '').replace(/<[^>]*>?/gm, ''); 
        const polishedSnippet = polishedNoteText.substring(0,100) + (polishedNoteText.length > 100 ? '...' : '');

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
            <select class="repolish-language" ${!isApiKeySet || !note.rawTranscription || !note.audioBlobBase64 ? 'disabled' : ''}></select>
            <button class="action-button-small repolish-note" title="Re-polish this note with selected language and its stored custom prompt" ${!isApiKeySet || !note.rawTranscription || !note.audioBlobBase64 ? 'disabled' : ''}>Re-polish</button>
            <button class="action-button-small danger delete-note" title="Delete Note">Delete</button>
          </div>
        `;
        
        const langSelect = item.querySelector('.repolish-language') as HTMLSelectElement;
        if (langSelect) {
            DEFAULT_LANGUAGES.forEach(lang => {
              const option = document.createElement('option');
              option.value = lang.code;
              option.textContent = lang.name;
              langSelect.appendChild(option);
            });
            langSelect.value = noteTargetLanguage;
        }

        const loadButton = item.querySelector('.load-note');
        if (loadButton) loadButton.addEventListener('click', () => this.loadNoteIntoEditor(note.id));
        
        const repolishButton = item.querySelector('.repolish-note') as HTMLButtonElement;
        if (repolishButton && langSelect) {
            if (!note.rawTranscription || !note.audioBlobBase64) { // Disable if no audio/raw
                repolishButton.disabled = true;
                langSelect.disabled = true;
            }
            repolishButton.addEventListener('click', async () => {
              if (!this.genAI || !this.userApiKey) {
                this.openSettingsModal();
                return;
              }
              if (!note.rawTranscription || !note.audioBlobBase64){
                this.recordingStatus.textContent = 'Cannot re-polish: Missing audio or raw transcription.';
                this.recordingStatus.className = 'status-text warning';
                return;
              }

              const newLang = langSelect.value;
              // Use the note's stored custom prompt for archive re-polish.
              // To change custom prompt, user loads to editor and uses the main interface.
              const customPromptForRepolish = note.customPolishingPrompt; 
              
              this.recordingStatus.textContent = `Re-polishing "${noteTitle}"...`;
              this.recordingStatus.className = 'status-text';
              repolishButton.textContent = 'Polishing...';
              repolishButton.disabled = true;
              langSelect.disabled = true;
              
              await this.getPolishedNote(note.id, newLang, customPromptForRepolish);
              
              repolishButton.textContent = 'Re-polish';
              if (this.genAI && this.userApiKey && note.rawTranscription && note.audioBlobBase64) { 
                repolishButton.disabled = false;
                langSelect.disabled = false;
              }
              this.renderArchiveList(); 
              if (this.currentNoteId === note.id) {
                  this.displayNote(note.id);
              }
            });
        }

        const deleteButton = item.querySelector('.delete-note');
        if (deleteButton) deleteButton.addEventListener('click', () => this.deleteNote(note.id));

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
      textToCopy = this.polishedNoteDiv.innerText; // Get text content, not HTML
      buttonToUpdate = this.copyPolishedNoteButton;
      originalButtonHTML = '<i class="fas fa-copy"></i> Copy Polished';
      if (textToCopy === polishedPlaceholder) textToCopy = ''; // Treat placeholder as empty
    } else {
      textToCopy = this.rawTranscriptionDiv.textContent;
      buttonToUpdate = this.copyRawTranscriptionButton;
      originalButtonHTML = '<i class="fas fa-copy"></i> Copy Raw';
      if (textToCopy === rawPlaceholder) textToCopy = ''; // Treat placeholder as empty
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
          const btnOriginalHTMLOnError = buttonToUpdate.innerHTML; // Capture current (possibly "Copied!")
          buttonToUpdate.innerHTML = '<i class="fas fa-times"></i> Failed';
          // No disabled here, allow retry
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
          const btnOriginalHTMLOnEmpty = buttonToUpdate.innerHTML;
          buttonToUpdate.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Empty';
          // No disabled here
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

  private deleteNote(noteId: string): void {
    if (!confirm('Are you sure you want to delete this note? This cannot be undone.')) return;

    this.allNotes = this.allNotes.filter(n => n.id !== noteId);
    this.saveNotes();
    this.renderArchiveList(); 

    if (this.currentNoteId === noteId) { 
      if (this.allNotes.length > 0) {
        this.loadNoteIntoEditor(this.allNotes.sort((a,b) => b.timestamp - a.timestamp)[0].id); 
      } else {
        this.createNewNote(); 
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

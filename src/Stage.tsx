import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";

/***
 The type that this stage persists message-level state in.
 This is primarily for readability, and not enforced.
 
 @description This type is saved in the database after each message,
  which makes it ideal for storing things like positions and statuses,
  but not for things like history, which is best managed ephemerally
  in the internal state of the Stage class itself.
 ***/
type Preset = {
   id: string;
   name: string;
   summary: string;
   exportedAt: string;
   stageState: {
       someKey: string;
       numUsers: number;
       numChars: number;
   };
};

type MessageStateType = {
   someKey?: string;
   numUsers?: number;
   numChars?: number;
   presetName?: string;
   presets?: Preset[];
   importText?: string;
   exportText?: string;
   lastSavedAt?: string | null;
};

/***
 The type of the stage-specific configuration of this stage.
 
 @description This is for things you want people to be able to configure,
  like background color.
 ***/
type ConfigType = {
   storageKey?: string;
   defaultPresetName?: string;
};

/***
 The type that this stage persists chat initialization state in.
 If there is any 'constant once initialized' static state unique to a chat,
 like procedurally generated terrain that is only created ONCE and ONLY ONCE per chat,
 it belongs here.
 ***/
type InitStateType = any;

/***
 The type that this stage persists dynamic chat-level state in.
 This is for any state information unique to a chat,
    that applies to ALL branches and paths such as clearing fog-of-war.
 It is usually unlikely you will need this, and if it is used for message-level
    data like player health then it will enter an inconsistent state whenever
    they change branches or jump nodes. Use MessageStateType for that.
 ***/
type ChatStateType = any;

/***
 A simple example class that implements the interfaces necessary for a Stage.
 If you want to rename it, be sure to modify App.js as well.
 @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/stage.ts
 ***/
export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

   /***
     A very simple example internal state. Can be anything.
     This is ephemeral in the sense that it isn't persisted to a database,
     but exists as long as the instance does, i.e., the chat page is open.
     ***/
   myInternalState: {[key: string]: any};

   private storageKey: string;

   private getCurrentStateSnapshot(): Record<string, any> {
       return {
           someKey: this.myInternalState['someKey'] ?? 'someValue',
           numUsers: this.myInternalState['numUsers'] ?? 0,
           numChars: this.myInternalState['numChars'] ?? 0,
           presetName: this.myInternalState['presetName'] ?? 'My preset',
           presets: Array.isArray(this.myInternalState['presets']) ? this.myInternalState['presets'] : [],
           importText: this.myInternalState['importText'] ?? '',
           exportText: this.myInternalState['exportText'] ?? '',
           lastSavedAt: this.myInternalState['lastSavedAt'] ?? null,
       };
   }

   private readStoredPresets(): Preset[] {
       if (typeof window === 'undefined') {
           return [];
       }

       try {
           const raw = window.localStorage.getItem(this.storageKey);
           if (raw == null) {
               return [];
           }
           const parsed = JSON.parse(raw);
           return Array.isArray(parsed) ? parsed : [];
       } catch {
           return [];
       }
   }

   private writeStoredPresets(presets: Preset[]): void {
       if (typeof window === 'undefined') {
           return;
       }

       window.localStorage.setItem(this.storageKey, JSON.stringify(presets));
   }

   constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
       /***
         This is the first thing called in the stage,
         to create an instance of it.
         The definition of InitialData is at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/initial.ts
         Character at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/character.ts
         User at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/user.ts
         ***/
       super(data);
       const {
           characters,
           users,
           config,
           messageState,
       } = data;

       const storedPresets = this.readStoredPresets();
       const initialState = messageState != null ? messageState : {};
       const presetStorageKey = config != null && typeof config === 'object' && 'storageKey' in config && typeof config.storageKey === 'string'
           ? config.storageKey
           : 'chub-stage-preset-library';
       this.storageKey = presetStorageKey;

       this.myInternalState = {
           ...initialState,
           someKey: initialState.someKey ?? 'someValue',
           numUsers: Object.keys(users).length,
           numChars: Object.keys(characters).length,
           presetName: initialState.presetName ?? (config != null && typeof config === 'object' && 'defaultPresetName' in config && typeof config.defaultPresetName === 'string' ? config.defaultPresetName : 'Starter preset'),
           presets: Array.isArray(initialState.presets) && initialState.presets.length > 0 ? initialState.presets : storedPresets,
           importText: initialState.importText ?? '',
           exportText: initialState.exportText ?? '',
           lastSavedAt: initialState.lastSavedAt ?? null,
       };
   }

   async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
       /***
         This is called immediately after the constructor, in case there is some asynchronous code you need to
         run on instantiation.
         ***/
       return {
           success: true,
           error: null,
           initState: null,
           chatState: null,
       };
   }

   async setState(state: MessageStateType): Promise<void> {
       /***
         This can be called at any time, typically after a jump to a different place in the chat tree
         or a swipe. Note how neither InitState nor ChatState are given here. They are not for
         state that is affected by swiping.
         ***/
       if (state != null) {
           this.myInternalState = {...this.myInternalState, ...state};
       }
   }

   async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
       const {
           content,
           anonymizedId,
           isBot,
       } = userMessage;
       return {
           stageDirections: null,
           messageState: this.getCurrentStateSnapshot(),
           modifiedMessage: null,
           systemMessage: null,
           error: null,
           chatState: null,
       };
   }

   async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
       const {
           content,
           anonymizedId,
           isBot,
       } = botMessage;
       return {
           stageDirections: null,
           messageState: this.getCurrentStateSnapshot(),
           modifiedMessage: null,
           error: null,
           systemMessage: null,
           chatState: null
       };
   }

   render(): ReactElement {
       const savePreset = () => {
           const presetName = String(this.myInternalState['presetName'] ?? 'Untitled preset').trim() || 'Untitled preset';
           const preset: Preset = {
               id: `${Date.now()}`,
               name: presetName,
               summary: `Preset for ${presetName}`,
               exportedAt: new Date().toISOString(),
               stageState: {
                   someKey: String(this.myInternalState['someKey'] ?? 'someValue'),
                   numUsers: Number(this.myInternalState['numUsers'] ?? 0),
                   numChars: Number(this.myInternalState['numChars'] ?? 0),
               },
           };

           const nextPresets = [preset, ...(Array.isArray(this.myInternalState['presets']) ? this.myInternalState['presets'] : [])
               .filter((entry: Preset) => entry && entry.name != null)]
               .filter((entry: Preset, index: number, list: Preset[]) => list.findIndex((candidate) => candidate.name.toLowerCase() === entry.name.toLowerCase()) === index);

           this.myInternalState['presets'] = nextPresets;
           this.myInternalState['lastSavedAt'] = preset.exportedAt;
           this.myInternalState['exportText'] = JSON.stringify(preset, null, 2);
           this.writeStoredPresets(nextPresets);
       };

       const applyPreset = (preset: Preset) => {
           this.myInternalState['someKey'] = preset.stageState.someKey;
           this.myInternalState['presetName'] = preset.name;
           this.myInternalState['numUsers'] = preset.stageState.numUsers;
           this.myInternalState['numChars'] = preset.stageState.numChars;
           this.myInternalState['exportText'] = JSON.stringify(preset, null, 2);
       };

       const importPreset = () => {
           const raw = String(this.myInternalState['importText'] ?? '').trim();
           if (raw.length === 0) {
               return;
           }

           try {
               const parsed = JSON.parse(raw);
               const nextPresetEntries = Array.isArray(parsed) ? parsed : [parsed];
               const normalized = nextPresetEntries
                   .filter((entry: any) => entry != null && entry.name)
                   .map((entry: any) => ({
                       id: entry.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                       name: entry.name,
                       summary: entry.summary ?? `Imported preset: ${entry.name}`,
                       exportedAt: entry.exportedAt ?? new Date().toISOString(),
                       stageState: {
                           someKey: entry.stageState?.someKey ?? 'someValue',
                           numUsers: Number(entry.stageState?.numUsers ?? 0),
                           numChars: Number(entry.stageState?.numChars ?? 0),
                       },
                   }));

               if (normalized.length === 0) {
                   return;
               }

               const existingPresets = Array.isArray(this.myInternalState['presets']) ? this.myInternalState['presets'] : [];
               const merged = [...normalized, ...existingPresets];
               this.myInternalState['presets'] = merged.filter((entry: Preset, index: number, list: Preset[]) => list.findIndex((candidate) => candidate.name.toLowerCase() === entry.name.toLowerCase()) === index);
               this.myInternalState['presetName'] = normalized[0].name;
               this.myInternalState['someKey'] = normalized[0].stageState.someKey;
               this.myInternalState['numUsers'] = normalized[0].stageState.numUsers;
               this.myInternalState['numChars'] = normalized[0].stageState.numChars;
               this.myInternalState['exportText'] = JSON.stringify(normalized[0], null, 2);
               this.writeStoredPresets(this.myInternalState['presets']);
           } catch {
               this.myInternalState['exportText'] = 'Invalid JSON preset';
           }
       };

       const exportPreset = () => {
           const selectedName = String(this.myInternalState['presetName'] ?? '').trim();
           const presets = Array.isArray(this.myInternalState['presets']) ? this.myInternalState['presets'] : [];
           const preset = presets.find((entry: Preset) => entry.name === selectedName) ?? {
               id: `${Date.now()}`,
               name: selectedName || 'Current preset',
               summary: 'Current preset export',
               exportedAt: new Date().toISOString(),
               stageState: {
                   someKey: String(this.myInternalState['someKey'] ?? 'someValue'),
                   numUsers: Number(this.myInternalState['numUsers'] ?? 0),
                   numChars: Number(this.myInternalState['numChars'] ?? 0),
               },
           };

           const json = JSON.stringify(preset, null, 2);
           this.myInternalState['exportText'] = json;
           if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
               navigator.clipboard.writeText(json).catch(() => undefined);
           }
       };

       const savedPresets = Array.isArray(this.myInternalState['presets']) ? this.myInternalState['presets'] : [];

       return <div className="preset-stage" style={{
           width: '100vw',
           height: '100vh',
           display: 'flex',
           alignItems: 'center',
           justifyContent: 'center',
           padding: '18px',
           boxSizing: 'border-box',
           overflow: 'auto',
           color: '#f9fafb',
           fontFamily: 'sans-serif'
       }}>
           <div style={{
               width: 'min(720px, 100%)',
               background: 'rgba(15, 23, 42, 0.82)',
               border: '1px solid rgba(148, 163, 184, 0.35)',
               borderRadius: '16px',
               padding: '20px',
               boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
               overflow: 'auto'
           }}>
               <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '12px' }}>Preset manager</div>
               <div style={{ display: 'grid', gap: '12px' }}>
                   <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                       <label htmlFor="preset-name" style={{ minWidth: '110px' }}>Preset name</label>
                       <input
                           id="preset-name"
                           value={String(this.myInternalState['presetName'] ?? '')}
                           onChange={(event) => {
                               this.myInternalState['presetName'] = event.target.value;
                           }}
                           style={{
                               flex: '1 1 220px',
                               background: 'rgba(15, 23, 42, 0.9)',
                               border: '1px solid rgba(148, 163, 184, 0.45)',
                               borderRadius: '8px',
                               color: '#f8fafc',
                               padding: '8px 10px'
                           }}
                       />
                   </div>

                   <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                       <button onClick={savePreset} style={buttonStyle}>Save preset</button>
                       <button onClick={exportPreset} style={buttonStyle}>Export JSON</button>
                       <button onClick={importPreset} style={buttonStyle}>Import JSON</button>
                   </div>

                   <div style={{ display: 'grid', gap: '8px' }}>
                       <label htmlFor="preset-import" style={{ fontWeight: 600 }}>Import data</label>
                       <textarea
                           id="preset-import"
                           value={String(this.myInternalState['importText'] ?? '')}
                           onChange={(event) => {
                               this.myInternalState['importText'] = event.target.value;
                           }}
                           rows={6}
                           style={{
                               width: '100%',
                               resize: 'vertical',
                               borderRadius: '10px',
                               border: '1px solid rgba(148, 163, 184, 0.45)',
                               background: 'rgba(15, 23, 42, 0.9)',
                               color: '#e2e8f0',
                               padding: '12px',
                               boxSizing: 'border-box'
                           }}
                       />
                   </div>

                   <div style={{ display: 'grid', gap: '8px' }}>
                       <label htmlFor="preset-export" style={{ fontWeight: 600 }}>Export data</label>
                       <textarea
                           id="preset-export"
                           value={String(this.myInternalState['exportText'] ?? '')}
                           onChange={(event) => {
                               this.myInternalState['exportText'] = event.target.value;
                           }}
                           rows={6}
                           style={{
                               width: '100%',
                               resize: 'vertical',
                               borderRadius: '10px',
                               border: '1px solid rgba(148, 163, 184, 0.45)',
                               background: 'rgba(15, 23, 42, 0.9)',
                               color: '#e2e8f0',
                               padding: '12px',
                               boxSizing: 'border-box'
                           }}
                       />
                   </div>

                   <div style={{ display: 'grid', gap: '8px' }}>
                       <div style={{ fontWeight: 600 }}>Saved presets</div>
                       <div style={{ display: 'grid', gap: '8px' }}>
                           {savedPresets.length === 0 ? (
                               <div style={{ opacity: 0.75 }}>No presets saved yet.</div>
                           ) : savedPresets.map((preset: Preset) => (
                               <div key={preset.id} style={{
                                   display: 'flex',
                                   alignItems: 'center',
                                   justifyContent: 'space-between',
                                   gap: '8px',
                                   border: '1px solid rgba(148, 163, 184, 0.35)',
                                   borderRadius: '10px',
                                   padding: '10px 12px',
                                   background: 'rgba(15, 23, 42, 0.55)'
                               }}>
                                   <div>
                                       <div style={{ fontWeight: 600 }}>{preset.name}</div>
                                       <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>{preset.summary}</div>
                                   </div>
                                   <div style={{ display: 'flex', gap: '6px' }}>
                                       <button onClick={() => applyPreset(preset)} style={smallButtonStyle}>Load</button>
                                       <button onClick={() => {
                                           const nextPresets = savedPresets.filter((entry: Preset) => entry.id !== preset.id);
                                           this.myInternalState['presets'] = nextPresets;
                                           this.writeStoredPresets(nextPresets);
                                       }} style={smallButtonStyle}>Delete</button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>

                   <div style={{ opacity: 0.8, fontSize: '0.82rem' }}>
                       Active values: {this.myInternalState['numChars']} character(s), {this.myInternalState['numUsers']} user(s), current preset: {this.myInternalState['presetName'] ?? 'Unassigned'}
                   </div>
               </div>
           </div>
       </div>;
   }

}

const buttonStyle: React.CSSProperties = {
   background: '#2563eb',
   color: '#ffffff',
   border: 'none',
   borderRadius: '8px',
   padding: '8px 12px',
   fontWeight: 600,
   cursor: 'pointer'
};

const smallButtonStyle: React.CSSProperties = {
   background: 'rgba(148, 163, 184, 0.2)',
   color: '#f8fafc',
   border: '1px solid rgba(148, 163, 184, 0.4)',
   borderRadius: '8px',
   padding: '6px 10px',
   cursor: 'pointer'
};

export type TourLocale = 'en' | 'te';
export type TourPortal = 'student' | 'staff' | 'admin' | 'accounts' | 'driver' | 'gatekeeper' | 'applicant';
export type Localized<T = string> = Record<TourLocale, T>;
export interface TourStep {
  id: string;
  route: string;
  target: string;
  title: Localized;
  body: Localized;
  narration: Localized<string[]>;
  event?: string;
  permission?: string;
  feature?: string;
  featureFlag?: string;
  portalSetting?: 'staff.payslips_enabled';
  prerequisite?: string;
  readOnly?: boolean;
  chapterId?: string;
  audioSource?: { tourId: string; version: number; stepId: string; narrationVersion?: number };
}
export interface TourDefinition {
  id: string;
  version: number;
  narrationVersion: number;
  portal: TourPortal;
  kind: 'welcome' | 'task' | 'feature' | 'complete';
  category?: string;
  routes?: string[];
  title: Localized;
  description: Localized;
  steps: TourStep[];
}
export interface TourIdentity { schoolId: number; userId: string; contextId: string; portal: TourPortal }
export interface TourProgress { stepId: string; status: 'paused' | 'completed'; skipped: string[]; visited?: string[]; updatedAt: number }
export interface TourPreferences { locale: TourLocale | null; narration: boolean; rate: number; autoAdvance: boolean }
export interface TourRect { x: number; y: number; width: number; height: number }
export interface TourTargetHandle {
  id: string;
  route: string;
  host: string;
  measure: () => Promise<TourRect | null>;
  reveal?: () => Promise<void>;
}
export type TourPhase = 'idle' | 'navigating' | 'waiting' | 'presenting' | 'action' | 'paused' | 'missing' | 'completed';
export interface TourState {
  tourId: string | null;
  index: number;
  phase: TourPhase;
  generation: number;
  rect: TourRect | null;
  host: string;
  skipped: string[];
  visited: string[];
  reason?: 'target' | 'access' | 'prerequisite' | 'interrupted';
}
export interface AudioClip { hash: string; url: string; sha256: string; bytes: number }
export interface AudioManifest { schemaVersion: number; clips: Record<string, AudioClip> }

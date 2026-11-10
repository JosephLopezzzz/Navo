import { requireOptionalNativeModule } from 'expo';

export interface PreparedSound {
  durationSeconds: number;
  sizeBytes: number;
}

interface NavoAlarmSoundsModule {
  prepareSound(sourceUri: string, fileName: string): Promise<PreparedSound>;
  getSoundUri(fileName: string): Promise<string | null>;
  deleteSound(fileName: string): Promise<void>;
  pruneUnusedSounds(fileNames: string[]): Promise<void>;
  presentNotification(identifier: string, fileName: string, channelId: string, label: string, body: string, data: Record<string, string>): Promise<void>;
  isNotificationPresented(identifier: string): Promise<boolean>;
  dismissNotification(identifier: string): Promise<void>;
}

export default requireOptionalNativeModule<NavoAlarmSoundsModule>('NavoAlarmSounds');

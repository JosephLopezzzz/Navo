package expo.modules.navoalarmsounds

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class NavoAlarmSoundsModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext) { "Navo is unavailable" }

  override fun definition() = ModuleDefinition {
    Name("NavoAlarmSounds")
    AsyncFunction("prepareSound") Coroutine { sourceUri: String, fileName: String ->
      val currentContext = context()
      withContext(Dispatchers.IO) { ImportedAlarmSoundManager.prepareSound(currentContext, sourceUri, fileName) }
    }
    AsyncFunction("getSoundUri") { fileName: String -> ImportedAlarmSoundManager.getSoundUri(context(), fileName) }
    AsyncFunction("deleteSound") { fileName: String -> ImportedAlarmSoundManager.deleteSound(context(), fileName) }
    AsyncFunction("pruneUnusedSounds") { fileNames: List<String> -> ImportedAlarmSoundManager.pruneUnusedSounds(context(), fileNames) }
    AsyncFunction("presentNotification") { identifier: String, fileName: String, channelId: String, label: String, body: String, data: Map<String, String> ->
      ImportedAlarmSoundManager.presentNotification(context(), identifier, fileName, channelId, label, body, data)
    }
    AsyncFunction("isNotificationPresented") { identifier: String -> ImportedAlarmSoundManager.isNotificationPresented(context(), identifier) }
    AsyncFunction("dismissNotification") { identifier: String -> ImportedAlarmSoundManager.dismissNotification(context(), identifier) }
  }
}

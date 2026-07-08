package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Function("isEnabled") {
      NotificationManagerCompat.getEnabledListenerPackages(context)
        .contains(context.packageName)
    }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("setAllowlist") { packages: List<String> ->
      RiddhiNotificationListenerService.setAllowlist(context, packages)
    }

    AsyncFunction("getPending") { max: Int ->
      CaptureStore.get(context).getPending(max)
    }

    AsyncFunction("markUploaded") { ids: List<String> ->
      CaptureStore.get(context).markUploaded(ids)
    }

    AsyncFunction("clearAll") {
      CaptureStore.get(context).clearAll()
    }
  }
}

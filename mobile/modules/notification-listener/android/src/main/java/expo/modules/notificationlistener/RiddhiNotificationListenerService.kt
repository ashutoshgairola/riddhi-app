package expo.modules.notificationlistener

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Reads the JS-configured allowlist from SharedPreferences and stores matching
 *  notifications. Runs whenever the user has granted notification access. */
class RiddhiNotificationListenerService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    val allow = allowlist(this)
    if (allow.isNotEmpty() && !allow.contains(pkg)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
    if (text.isNullOrBlank()) return

    CaptureStore.get(this).insert(pkg, title, text, sbn.postTime)
  }

  companion object {
    private const val PREFS = "notif_listener_prefs"
    private const val KEY_ALLOW = "allowlist"

    fun setAllowlist(context: Context, packages: List<String>) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putStringSet(KEY_ALLOW, packages.toSet()).apply()
    }

    fun allowlist(context: Context): Set<String> =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getStringSet(KEY_ALLOW, emptySet()) ?: emptySet()
  }
}

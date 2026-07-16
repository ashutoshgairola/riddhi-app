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
    // Privacy default-deny: an empty/unseeded allowlist captures NOTHING. JS
    // seeds DEFAULT_ALLOWLIST via setAllowlist (persisted in SharedPreferences),
    // so nothing is stored until the app seeds the allowlist at least once.
    if (!allow.contains(pkg)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
    if (text.isNullOrBlank()) return

    // Extract fields on the callback (main) thread — cheap — then persist off
    // it. insert() also runs a row-cap DELETE, so keep it off the main thread
    // to avoid ANR/jank under bursty notifications. Use applicationContext in
    // the lambda so we don't hold the service context on the background thread.
    val postTime = sbn.postTime
    ioExecutor.execute {
      CaptureStore.get(applicationContext).insert(pkg, title, text, postTime)
    }
  }

  companion object {
    private const val PREFS = "notif_listener_prefs"
    private const val KEY_ALLOW = "allowlist"

    private val ioExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    fun setAllowlist(context: Context, packages: List<String>) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putStringSet(KEY_ALLOW, packages.toSet()).apply()
    }

    fun allowlist(context: Context): Set<String> =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getStringSet(KEY_ALLOW, emptySet()) ?: emptySet()
  }
}

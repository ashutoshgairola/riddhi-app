package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.provider.Settings
import android.util.Base64
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

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

    AsyncFunction("getInstalledPackages") { candidates: List<String> ->
      val pm = context.packageManager
      candidates.filter { pkg ->
        try {
          pm.getPackageInfo(pkg, 0); true
        } catch (e: PackageManager.NameNotFoundException) {
          false // not installed, OR not visible (not declared in <queries>)
        }
      }
    }

    AsyncFunction("getAppIcons") { packages: List<String> ->
      val pm = context.packageManager
      val out = HashMap<String, String>()
      for (pkg in packages) {
        try {
          val drawable: Drawable = pm.getApplicationIcon(pkg)
          val bitmap = drawableToBitmap(drawable)
          val stream = ByteArrayOutputStream()
          bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
          out[pkg] = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
          // not installed / not visible — omit; JS falls back to a category glyph
        }
      }
      out
    }
  }

  private fun drawableToBitmap(drawable: Drawable): Bitmap {
    if (drawable is BitmapDrawable && drawable.bitmap != null) return drawable.bitmap
    val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
    val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)
    return bitmap
  }
}

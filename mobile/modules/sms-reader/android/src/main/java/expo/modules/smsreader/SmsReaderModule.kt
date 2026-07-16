package expo.modules.smsreader

import android.content.Context
import android.provider.Telephony
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads the device SMS inbox via ContentResolver. Registered on Android only.
 * The caller (JS) is responsible for holding the READ_SMS runtime permission
 * before invoking getMessages; without it the query throws a SecurityException
 * which surfaces to JS as a rejected promise.
 */
class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    AsyncFunction("getMessages") { sinceMs: Double, max: Int ->
      readInbox(sinceMs.toLong(), max)
    }
  }

  private fun readInbox(sinceMs: Long, max: Int): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    val projection = arrayOf(
      Telephony.Sms._ID,
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE,
    )
    val selection = "${Telephony.Sms.DATE} >= ?"
    val selectionArgs = arrayOf(sinceMs.toString())
    val sortOrder = "${Telephony.Sms.DATE} DESC"

    context.contentResolver
      .query(Telephony.Sms.Inbox.CONTENT_URI, projection, selection, selectionArgs, sortOrder)
      ?.use { cursor ->
        val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addrIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext() && out.size < max) {
          out.add(
            mapOf(
              "id" to cursor.getString(idIdx),
              "address" to (cursor.getString(addrIdx) ?: ""),
              "body" to (cursor.getString(bodyIdx) ?: ""),
              "date" to cursor.getLong(dateIdx).toDouble(),
            ),
          )
        }
      }
    return out
  }
}

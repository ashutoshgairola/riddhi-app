package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Single-table on-device log of captured notifications. */
class CaptureStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, DB_NAME, null, 1) {

  companion object {
    private const val DB_NAME = "notif_capture.db"
    private const val TABLE = "captures"
    private const val MAX_ROWS = 5000

    @Volatile private var instance: CaptureStore? = null
    fun get(context: Context): CaptureStore =
      instance ?: synchronized(this) {
        instance ?: CaptureStore(context).also { instance = it }
      }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE $TABLE (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "pkg TEXT NOT NULL, title TEXT, text TEXT NOT NULL," +
        "postedAt INTEGER NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0)",
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
    db.execSQL("DROP TABLE IF EXISTS $TABLE")
    onCreate(db)
  }

  fun insert(pkg: String, title: String?, text: String, postedAt: Long) {
    val db = writableDatabase
    db.insert(TABLE, null, ContentValues().apply {
      put("pkg", pkg); put("title", title); put("text", text); put("postedAt", postedAt)
    })
    // Trim oldest beyond the cap.
    db.execSQL(
      "DELETE FROM $TABLE WHERE id NOT IN " +
        "(SELECT id FROM $TABLE ORDER BY id DESC LIMIT $MAX_ROWS)",
    )
  }

  fun getPending(max: Int): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    readableDatabase.query(
      TABLE, null, "uploaded = 0", null, null, null, "postedAt ASC", max.toString(),
    ).use { c ->
      val idI = c.getColumnIndexOrThrow("id")
      val pkgI = c.getColumnIndexOrThrow("pkg")
      val titleI = c.getColumnIndexOrThrow("title")
      val textI = c.getColumnIndexOrThrow("text")
      val postedI = c.getColumnIndexOrThrow("postedAt")
      while (c.moveToNext()) {
        out.add(
          mapOf(
            "id" to c.getLong(idI).toString(),
            "packageName" to c.getString(pkgI),
            "title" to (c.getString(titleI) ?: ""),
            "text" to c.getString(textI),
            "postedAt" to c.getLong(postedI).toDouble(),
          ),
        )
      }
    }
    return out
  }

  fun markUploaded(ids: List<String>) {
    if (ids.isEmpty()) return
    val placeholders = ids.joinToString(",") { "?" }
    writableDatabase.execSQL(
      "UPDATE $TABLE SET uploaded = 1 WHERE id IN ($placeholders)",
      ids.toTypedArray(),
    )
  }

  fun clearAll() {
    writableDatabase.execSQL("DELETE FROM $TABLE")
  }
}

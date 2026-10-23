package com.anywecon.aulos.mediastore

import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

private const val ARTWORK_DIR = "artwork"
private const val MIN_ARTWORK_PX = 32
private const val MAX_ARTWORK_PX = 1024
private const val ARTWORK_JPEG_QUALITY = 90
private val LEGACY_ALBUM_ART_URI: Uri = Uri.parse("content://media/external/audio/albumart")

class MediaStoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MediaStore")

    AsyncFunction("queryAudio") Coroutine { ->
      withContext(Dispatchers.IO) { queryAudio() }
    }

    AsyncFunction("getVersion") Coroutine { ->
      withContext(Dispatchers.IO) { mapOf("token" to versionToken()) }
    }

    AsyncFunction("loadArtwork") Coroutine { contentUri: String, sizePx: Int ->
      withContext(Dispatchers.IO) { loadArtwork(Uri.parse(contentUri), sizePx) }
    }

    AsyncFunction("checkFiles") Coroutine { contentUris: List<String> ->
      withContext(Dispatchers.IO) { contentUris.map { checkFile(Uri.parse(it)) } }
    }
  }

  private fun queryAudio(): List<Map<String, Any?>> {
    val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val hasAlbumArtist = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val hasRelativePath = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    val projection = buildList {
      add(MediaStore.Audio.Media._ID)
      add(MediaStore.Audio.Media.TITLE)
      add(MediaStore.Audio.Media.DISPLAY_NAME)
      add(MediaStore.Audio.Media.ARTIST)
      add(MediaStore.Audio.Media.ALBUM)
      if (hasAlbumArtist) add(MediaStore.Audio.Media.ALBUM_ARTIST)
      add(MediaStore.Audio.Media.TRACK)
      add(MediaStore.Audio.Media.YEAR)
      add(MediaStore.Audio.Media.DURATION)
      add(MediaStore.Audio.Media.SIZE)
      add(MediaStore.Audio.Media.DATE_MODIFIED)
      add(MediaStore.Audio.Media.DATE_ADDED)
      add(MediaStore.Audio.Media.ALBUM_ID)
      add(MediaStore.Audio.Media.MIME_TYPE)
      @Suppress("DEPRECATION")
      add(if (hasRelativePath) MediaStore.Audio.Media.RELATIVE_PATH else MediaStore.Audio.Media.DATA)
    }.toTypedArray()

    val cursor = context.contentResolver.query(
      collection,
      projection,
      "${MediaStore.Audio.Media.IS_MUSIC} != 0",
      null,
      "${MediaStore.Audio.Media._ID} ASC"
    ) ?: throw IllegalStateException("MediaStore query returned no cursor")

    return cursor.use { c ->
      val idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
      val displayNameCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
      val artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
      val albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
      val albumArtistCol =
        if (hasAlbumArtist) c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ARTIST) else -1
      val trackCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
      val yearCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
      val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val sizeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val dateModifiedCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val dateAddedCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
      val albumIdCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val mimeTypeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      val folderCol = c.getColumnIndexOrThrow(projection.last())

      val rows = ArrayList<Map<String, Any?>>(c.count)
      while (c.moveToNext()) {
        val id = c.getLong(idCol)
        // TRACK packs the disc number in the thousands: disc * 1000 + track.
        val packedTrack = c.longOrNull(trackCol)
        val trackNo = packedTrack?.rem(1000)?.takeIf { it > 0 }
        val discNo = packedTrack?.div(1000)?.takeIf { it > 0 }
        val title = c.tagOrNull(titleCol)
          ?: c.getStringOrNull(displayNameCol)?.substringBeforeLast('.')
          ?: id.toString()
        val folderValue = c.getStringOrNull(folderCol)
        val folder = if (hasRelativePath) folderValue else folderValue?.let(::volumeRelativeParent)

        rows.add(
          mapOf(
            "id" to id.toString(),
            "contentUri" to ContentUris.withAppendedId(collection, id).toString(),
            "title" to title,
            "artist" to c.tagOrNull(artistCol),
            "album" to c.tagOrNull(albumCol),
            "albumArtist" to if (albumArtistCol >= 0) c.tagOrNull(albumArtistCol) else null,
            "trackNo" to trackNo?.toInt(),
            "discNo" to discNo?.toInt(),
            "year" to c.longOrNull(yearCol)?.takeIf { it > 0 }?.toInt(),
            "durationMs" to c.longOrNull(durationCol)?.toDouble(),
            "sizeBytes" to c.longOrNull(sizeCol)?.toDouble(),
            // DATE_MODIFIED and DATE_ADDED are in seconds; expose milliseconds like Date.now().
            "dateModified" to c.longOrNull(dateModifiedCol)?.times(1000)?.toDouble(),
            "dateAdded" to c.longOrNull(dateAddedCol)?.times(1000)?.toDouble(),
            "albumId" to c.longOrNull(albumIdCol)?.toString(),
            "mimeType" to c.getStringOrNull(mimeTypeCol),
            "folder" to folder
          )
        )
      }
      rows
    }
  }

  /**
   * MediaStore version plus the generation of every external volume on API 30+; any change to
   * the media on a volume bumps its generation. Older releases have no generation, so the token
   * is the music row count and the newest modification time.
   */
  private fun versionToken(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val volumes = MediaStore.getExternalVolumeNames(context).sorted()
      val generations = volumes.joinToString(",") { "$it=${MediaStore.getGeneration(context, it)}" }
      return "v2:${MediaStore.getVersion(context)}:$generations"
    }
    val cursor = context.contentResolver.query(
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
      arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DATE_MODIFIED),
      "${MediaStore.Audio.Media.IS_MUSIC} != 0",
      null,
      null
    ) ?: return "v1:none"
    return cursor.use { c ->
      val dateCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      var newest = 0L
      while (c.moveToNext()) newest = maxOf(newest, c.longOrNull(dateCol) ?: 0L)
      "v1:${c.count}:$newest"
    }
  }

  /**
   * Album artwork as a JPEG in the app cache, keyed by album id and size, so every track of an
   * album shares one file. A ".none" marker remembers albums without artwork.
   */
  private fun loadArtwork(trackUri: Uri, sizePx: Int): String? {
    val albumId = queryAlbumId(trackUri) ?: return null
    val size = sizePx.coerceIn(MIN_ARTWORK_PX, MAX_ARTWORK_PX)
    val dir = File(context.cacheDir, ARTWORK_DIR).apply { mkdirs() }
    val file = File(dir, "${albumId}_$size.jpg")
    if (file.exists()) return Uri.fromFile(file).toString()
    val none = File(dir, "${albumId}_$size.none")
    if (none.exists()) return null

    val bitmap = decodeArtwork(trackUri, albumId, size)
    if (bitmap == null) {
      none.createNewFile()
      return null
    }
    // Write to a temp file and rename, so a concurrent reader never sees a partial JPEG.
    val temp = File.createTempFile("art", ".tmp", dir)
    try {
      temp.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, ARTWORK_JPEG_QUALITY, it) }
      if (!temp.renameTo(file) && !file.exists()) return null
    } finally {
      temp.delete()
      bitmap.recycle()
    }
    return Uri.fromFile(file).toString()
  }

  private fun decodeArtwork(trackUri: Uri, albumId: Long, size: Int): Bitmap? =
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        context.contentResolver.loadThumbnail(trackUri, Size(size, size), null)
      } else {
        decodeLegacyAlbumArt(ContentUris.withAppendedId(LEGACY_ALBUM_ART_URI, albumId), size)
      }
    } catch (e: IOException) {
      null
    } catch (e: SecurityException) {
      null
    } catch (e: IllegalArgumentException) {
      null
    }

  private fun decodeLegacyAlbumArt(uri: Uri, size: Int): Bitmap? {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= size && bounds.outHeight / (sample * 2) >= size) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
  }

  private fun queryAlbumId(trackUri: Uri): Long? =
    context.contentResolver.query(
      trackUri,
      arrayOf(MediaStore.Audio.Media.ALBUM_ID),
      null,
      null,
      null
    )?.use { c -> if (c.moveToFirst()) c.longOrNull(0) else null }

  /**
   * True when the file behind the URI can be opened. A missing file is handed to the media
   * scanner, which drops its stale MediaStore row so the next library scan removes the track.
   */
  private fun checkFile(uri: Uri): Boolean {
    val readable = try {
      context.contentResolver.openFileDescriptor(uri, "r")?.use { true } ?: false
    } catch (e: IOException) {
      false
    } catch (e: SecurityException) {
      false
    } catch (e: IllegalArgumentException) {
      false
    }
    if (!readable) dataPath(uri)?.let { MediaScannerConnection.scanFile(context, arrayOf(it), null, null) }
    return readable
  }

  @Suppress("DEPRECATION")
  private fun dataPath(uri: Uri): String? =
    try {
      context.contentResolver.query(uri, arrayOf(MediaStore.Audio.Media.DATA), null, null, null)
        ?.use { c -> if (c.moveToFirst()) c.getStringOrNull(0) else null }
    } catch (e: SecurityException) {
      null
    } catch (e: IllegalArgumentException) {
      null
    }
}

/** "/storage/emulated/0/Music/Album/song.mp3" becomes "Music/Album/", like RELATIVE_PATH. */
private fun volumeRelativeParent(dataPath: String): String? {
  val parent = File(dataPath).parent ?: return null
  val relative = Regex("^/storage/(emulated/\\d+|[^/]+)/?").replace(parent, "")
  return if (relative.isEmpty()) "" else "$relative/"
}

private fun Cursor.getStringOrNull(index: Int): String? =
  if (isNull(index)) null else getString(index)

private fun Cursor.longOrNull(index: Int): Long? =
  if (isNull(index)) null else getLong(index)

/** Tag value with MediaStore's "<unknown>" placeholder and blanks mapped to null. */
private fun Cursor.tagOrNull(index: Int): String? =
  getStringOrNull(index)?.trim()?.takeIf { it.isNotEmpty() && it != MediaStore.UNKNOWN_STRING }

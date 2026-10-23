package com.anywecon.aulos.mediastore

import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MediaStoreModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MediaStore")

    AsyncFunction("queryAudio") Coroutine { ->
      withContext(Dispatchers.IO) { queryAudio() }
    }
  }

  private fun queryAudio(): List<Map<String, Any?>> {
    val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val hasAlbumArtist = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val projection = buildList {
      add(MediaStore.Audio.Media._ID)
      add(MediaStore.Audio.Media.TITLE)
      add(MediaStore.Audio.Media.DISPLAY_NAME)
      add(MediaStore.Audio.Media.ARTIST)
      add(MediaStore.Audio.Media.ALBUM)
      if (hasAlbumArtist) add(MediaStore.Audio.Media.ALBUM_ARTIST)
      add(MediaStore.Audio.Media.TRACK)
      add(MediaStore.Audio.Media.DURATION)
      add(MediaStore.Audio.Media.SIZE)
      add(MediaStore.Audio.Media.DATE_MODIFIED)
      add(MediaStore.Audio.Media.ALBUM_ID)
      add(MediaStore.Audio.Media.MIME_TYPE)
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
      val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val sizeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val dateModifiedCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val albumIdCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val mimeTypeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)

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
            "durationMs" to c.longOrNull(durationCol)?.toDouble(),
            "sizeBytes" to c.longOrNull(sizeCol)?.toDouble(),
            // DATE_MODIFIED is in seconds; expose milliseconds like Date.now().
            "dateModified" to c.longOrNull(dateModifiedCol)?.times(1000)?.toDouble(),
            "albumId" to c.longOrNull(albumIdCol)?.toString(),
            "mimeType" to c.getStringOrNull(mimeTypeCol)
          )
        )
      }
      rows
    }
  }
}

private fun Cursor.getStringOrNull(index: Int): String? =
  if (isNull(index)) null else getString(index)

private fun Cursor.longOrNull(index: Int): Long? =
  if (isNull(index)) null else getLong(index)

/** Tag value with MediaStore's "<unknown>" placeholder and blanks mapped to null. */
private fun Cursor.tagOrNull(index: Int): String? =
  getStringOrNull(index)?.trim()?.takeIf { it.isNotEmpty() && it != MediaStore.UNKNOWN_STRING }

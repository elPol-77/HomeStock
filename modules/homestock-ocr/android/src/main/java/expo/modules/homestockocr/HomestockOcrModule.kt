package expo.modules.homestockocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * OCR en el dispositivo con Google ML Kit (gratuito, sin conexión).
 * Devuelve cada línea con su posición para poder reconstruir filas de tickets.
 */
class HomestockOcrModule : Module() {
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("HomestockOcr")

    AsyncFunction("recognizeAsync") { uriString: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_NO_CONTEXT", "React context not available", null))
        return@AsyncFunction
      }
      try {
        val uri = when {
          uriString.startsWith("content://") || uriString.startsWith("file://") -> Uri.parse(uriString)
          else -> Uri.fromFile(File(uriString))
        }
        val image = InputImage.fromFilePath(context, uri)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val lines = ArrayList<Map<String, Any>>()
            for (block in result.textBlocks) {
              for (line in block.lines) {
                val box = line.boundingBox
                lines.add(
                  mapOf(
                    "text" to line.text,
                    "left" to (box?.left ?: 0),
                    "top" to (box?.top ?: 0),
                    "width" to (box?.width() ?: 0),
                    "height" to (box?.height() ?: 0)
                  )
                )
              }
            }
            promise.resolve(
              mapOf(
                "text" to result.text,
                "lines" to lines,
                "width" to image.width,
                "height" to image.height
              )
            )
          }
          .addOnFailureListener { e ->
            promise.reject(CodedException("ERR_OCR", e.message ?: "OCR failed", e))
          }
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_OCR_INPUT", e.message ?: "Invalid image", e))
      }
    }
  }
}

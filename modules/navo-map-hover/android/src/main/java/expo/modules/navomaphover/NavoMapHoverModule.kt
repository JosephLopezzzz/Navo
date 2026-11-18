package expo.modules.navomaphover

import android.content.Context
import android.view.InputDevice
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class NavoMapHoverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NavoMapHover")
    View(NativeHoverObserverView::class) {
      Events("onStationHover")
      Prop("observing") { view: NativeHoverObserverView, value: Boolean ->
        view.observing = value
      }
    }
  }
}

class NativeHoverObserverView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  var observing = true
  private val onStationHover by EventDispatcher()

  override fun dispatchHoverEvent(event: MotionEvent): Boolean {
    if (observing && event.pointerCount > 0) {
      val tool = event.getToolType(0)
      val mouse = event.isFromSource(InputDevice.SOURCE_MOUSE)
      val pen = tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER
      if (mouse || pen) {
        val phase = when (event.actionMasked) {
          MotionEvent.ACTION_HOVER_ENTER, MotionEvent.ACTION_HOVER_MOVE ->
            if (event.buttonState == 0) "move" else "exit"
          MotionEvent.ACTION_HOVER_EXIT -> "exit"
          else -> null
        }
        if (phase != null) {
          val density = resources.displayMetrics.density
          onStationHover(mapOf("phase" to phase, "x" to event.x / density, "y" to event.y / density))
        }
      }
    }
    // Preserve native map gestures and accessibility hover dispatch.
    return super.dispatchHoverEvent(event)
  }
}

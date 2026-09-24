package software.globus.lab.glmaprn

import android.content.Intent
import android.graphics.Point
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.UiSelector
import androidx.test.uiautomator.Until
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.regex.Pattern
import kotlin.math.abs

@RunWith(AndroidJUnit4::class)
class StageAViewTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private val output = "/sdcard/Download/glmap-rn-ui"

    private fun launch() {
        val intent = requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        context.startActivity(intent)
        // First-launch Expo onboarding is UI, not a GLMap failure.
        device.waitForIdle()
        device.findObject(By.text("Continue"))?.click()
        device.waitForIdle()
        device.findObject(By.desc("Close"))?.click()
        checkNotNull(device.wait(Until.findObject(By.desc("GLMap canvas")), 30000))
        // A preceding test may have left the camera snapshot in the status field.
        checkNotNull(device.wait(Until.findObject(By.res("lab-status")
            .desc(Pattern.compile("PASS:.*|\\{.*"))), 30000))
    }

    private fun button(title: String): UiObject2 = checkNotNull(device.wait(
        Until.findObject(By.text(Pattern.compile(Pattern.quote(title), Pattern.CASE_INSENSITIVE))), 5000))

    private fun state(label: String): JSONObject {
        button("State").click()
        device.waitForIdle()
        // Camera capture completes asynchronously on the render thread, then JS.
        SystemClock.sleep(250)
        val raw = checkNotNull(device.wait(Until.findObject(By.res("lab-status")), 5000)).contentDescription
        val result = JSONObject(raw)
        log(label, result)
        return result
    }

    private fun log(label: String, detail: Any) {
        android.util.Log.i("GLMapRNUI", JSONObject().put("step", label).put("detail", detail).toString())
    }

    private fun taps(): Int = checkNotNull(device.findObject(By.textStartsWith("React Native · Expo")))
        .text.substringAfterLast("taps ").toInt()

    private fun canvas() = checkNotNull(device.findObject(By.desc("GLMap canvas")))
    private fun gestureCenter(): Point {
        val r = canvas().visibleBounds
        // Below the absolute React overlay, away from system navigation edges.
        return Point(r.centerX(), r.top + r.height() * 2 / 3)
    }

    private fun capture(name: String) {
        device.executeShellCommand("mkdir -p $output")
        assertTrue(device.executeShellCommand("screencap -p $output/$name.png").isBlank())
        device.dumpWindowHierarchy(java.io.File(context.getExternalFilesDir(null), "$name.xml"))
    }

    private fun assertSameCamera(before: JSONObject, after: JSONObject) {
        for (key in listOf("latitude", "longitude", "zoom", "angle", "pitch", "originX", "originY")) {
            assertEquals(key, before.getDouble(key), after.getDouble(key), 0.001)
        }
    }

    private fun assertPan(label: String) {
        val before = state("$label-before")
        val point = gestureCenter()
        assertTrue(device.swipe(point.x, point.y, point.x + 180, point.y, 40))
        SystemClock.sleep(500)
        val after = state("$label-after")
        assertTrue("Pan must change center", abs(before.getDouble("longitude") - after.getDouble("longitude")) > 0.01)
    }

    @Test
    fun gesturesKeyboardNavigationAndRotation() {
        device.setOrientationNatural()
        try {
            launch()
            val initial = state("fixture")
            assertEquals(5.0, initial.getDouble("zoom"), 0.001)
            capture("A01-fixture")

            val count = taps()
            val point = gestureCenter()
            assertTrue(device.click(point.x, point.y))
            SystemClock.sleep(700) // Single-tap confirmation must outwait double-tap detection.
            assertEquals(count + 1, taps())
            log("single-tap-count", taps())
            state("single-tap")
            assertEquals(count + 1, taps()) // The overlay State button must not tap the map.
            assertPan("pan")

            val beforePinch = state("pinch-before")
            val nativeView = device.findObject(UiSelector().description("GLMap canvas"))
            val center = gestureCenter()
            assertTrue(nativeView.performTwoPointerGesture(
                Point(center.x - 80, center.y), Point(center.x + 80, center.y),
                Point(center.x - 230, center.y), Point(center.x + 230, center.y), 60))
            val afterPinch = state("pinch-after")
            assertTrue("Pinch open must zoom in", afterPinch.getDouble("zoom") > beforePinch.getDouble("zoom") + 0.2)

            val beforeRotate = state("rotate-before")
            assertTrue(nativeView.performTwoPointerGesture(
                Point(center.x - 150, center.y), Point(center.x + 150, center.y),
                Point(center.x, center.y - 150), Point(center.x, center.y + 150), 60))
            // GLMap snaps angles within 20 degrees back to north on touch release.
            // Test a larger turn and read after that animation has had time to finish.
            SystemClock.sleep(1000)
            val afterRotate = state("rotate-after")
            val delta = abs(afterRotate.getDouble("angle") - beforeRotate.getDouble("angle")) % 360
            assertTrue("Two-finger rotate must leave a changed angle", delta > 25 && delta < 335)
            capture("A03-gestures")

            val field = checkNotNull(device.findObject(By.clazz("android.widget.EditText")))
            field.click()
            device.waitForIdle()
            val keyboard = device.executeShellCommand("dumpsys input_method")
            assertTrue("Real OS keyboard must be shown", keyboard.contains("mInputShown=true"))
            device.executeShellCommand("input text GLMap%stest")
            assertEquals("GLMap test", checkNotNull(device.findObject(By.clazz("android.widget.EditText"))).text)
            capture("A04-keyboard")
            device.pressBack()
            device.waitForIdle()
            assertFalse(device.executeShellCommand("dumpsys input_method").contains("mInputShown=true"))
            button("Overlay").click()
            assertTrue(device.wait(Until.gone(By.clazz("android.widget.EditText")), 5000))
            button("Overlay").click()
            assertEquals("GLMap test", checkNotNull(device.wait(Until.findObject(By.clazz("android.widget.EditText")), 5000)).text)
            assertPan("after-keyboard")

            button("Vienna").click()
            val vienna = state("navigation-before")
            button("Leave map").click()
            assertTrue(device.wait(Until.hasObject(By.text("Map removed")), 5000))
            capture("A05-removed")
            button("Return").click()
            checkNotNull(device.wait(Until.findObject(By.desc("GLMap canvas")), 10000))
            SystemClock.sleep(300)
            assertSameCamera(vienna, state("navigation-after"))
            capture("A05-restored")

            device.setOrientationLeft()
            device.waitForIdle()
            assertTrue(device.displayWidth > device.displayHeight)
            val bounds = canvas().visibleBounds
            assertTrue(bounds.width() > bounds.height())
            assertSameCamera(vienna, state("landscape"))
            capture("A08-landscape")
            device.setOrientationNatural()
            device.waitForIdle()
            assertSameCamera(vienna, state("portrait"))
            capture("A08-portrait")
            log("gestures-keyboard-navigation-rotation", "passed")
        } finally {
            device.setOrientationNatural()
            device.unfreezeRotation()
        }
    }

    @Test
    fun fiveBackgroundResumeCycles() {
        device.setOrientationNatural()
        try {
            launch()
            button("Reset").click()
            for (cycle in 1..5) {
                val before = state("background-$cycle-before")
                val count = taps()
                assertTrue(device.pressHome())
                assertTrue(device.wait(Until.gone(By.pkg(context.packageName)), 5000))
                log("background-$cycle", "waiting 30 seconds")
                SystemClock.sleep(30000)
                val intent = requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                context.startActivity(intent)
                checkNotNull(device.wait(Until.findObject(By.desc("GLMap canvas")), 10000))
                assertSameCamera(before, state("resume-$cycle"))
                val point = gestureCenter()
                device.click(point.x, point.y)
                SystemClock.sleep(700)
                assertEquals(count + 1, taps())
                assertPan("resume-$cycle-pan")
                capture("A07-resume-$cycle")
                button("Reset").click()
            }
            log("five-background-resume-cycles", "passed")
        } finally {
            device.setOrientationNatural()
            device.unfreezeRotation()
        }
    }
}

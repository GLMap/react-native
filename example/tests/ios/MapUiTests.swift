import XCTest

final class MapUiTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "software.globus.glmap.reactnative.demo")

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.buttons["Lifecycle checks"].waitForExistence(timeout: 30), "Default entry must be the demo catalog")
        app.buttons["Lifecycle checks"].tap()
        let ready = NSPredicate(format: "label BEGINSWITH 'PASS:'")
        XCTAssertTrue(app.staticTexts.matching(ready).firstMatch.waitForExistence(timeout: 90))
    }

    func testDefaultCatalogAndPublicApiChecks() throws {
        app.buttons["Demos"].tap()
        XCTAssertTrue(app.staticTexts["GLMap · React Native"].waitForExistence(timeout: 10))
        app.buttons["API checks"].tap()
        let result = app.staticTexts["api-status"]
        let completed = expectation(for: NSPredicate(format: "label BEGINSWITH 'PASS:' OR label BEGINSWITH 'FAIL:'"), evaluatedWith: result)
        wait(for: [completed], timeout: 90)
        XCTAssertEqual(result.label, "PASS: 6 public SDK API checks")
        app.buttons["Demos"].tap()
        XCTAssertTrue(app.staticTexts["GLMap · React Native"].waitForExistence(timeout: 10))
        let darkTheme = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Dark Theme'")).firstMatch
        XCTAssertTrue(darkTheme.waitForExistence(timeout: 10))
        darkTheme.tap()
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 10))
        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["Lifecycle checks"].waitForExistence(timeout: 10))
    }

    override func tearDownWithError() throws {
        XCUIDevice.shared.orientation = .portrait
    }

    private func state(_ name: String) throws -> [String: Double] {
        app.buttons["State"].tap()
        let status = app.staticTexts["lifecycle-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.3) // Native capture replies asynchronously through JS.
        let value = try JSONDecoder().decode([String: Double].self, from: Data(status.label.utf8))
        print("GLMapRNUI \(name): \(status.label)")
        return value
    }

    private func taps() -> Int {
        let text = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'React Native · Expo'")).firstMatch.label
        return Int(text.components(separatedBy: "taps ").last ?? "") ?? -1
    }

    private func point(_ x: CGFloat = 0.5, _ y: CGFloat = 0.65) -> XCUICoordinate {
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func sameCamera(_ before: [String: Double], _ after: [String: Double]) throws {
        for key in ["latitude", "longitude", "zoom", "angle", "pitch", "originX", "originY"] {
            XCTAssertEqual(try XCTUnwrap(before[key]), try XCTUnwrap(after[key]), accuracy: 0.001, key)
        }
    }

    private func pan(_ name: String) throws {
        let before = try state("\(name)-before")
        point().press(forDuration: 0.1, thenDragTo: point(0.75))
        Thread.sleep(forTimeInterval: 0.5)
        let after = try state("\(name)-after")
        XCTAssertGreaterThan(abs(try XCTUnwrap(after["longitude"]) - XCTUnwrap(before["longitude"])), 0.01)
    }

    func testTapAndPan() throws {
        let initial = try state("fixture")
        XCTAssertEqual(try XCTUnwrap(initial["zoom"]), 5, accuracy: 0.001)
        capture("A01-fixture")
        let count = taps()
        point().tap()
        Thread.sleep(forTimeInterval: 0.7)
        XCTAssertEqual(taps(), count + 1)
        _ = try state("single-tap")
        XCTAssertEqual(taps(), count + 1)
        try pan("pan")
        capture("A03-pan")
    }

    func testPinch() throws {
        // Hide the React overlay so XCTest's two-finger path stays on the map.
        let beforePinch = try state("pinch-before")
        app.buttons["Overlay"].tap()
        // XCTest scale 4 moves each finger less than 30 pt on this simulator.
        // GLMap's pitch recognizer needs 30 pt before it can reject the gesture
        // and release pinch. Use a larger physical path, retaining native input.
        app.windows.firstMatch.pinch(withScale: 8, velocity: 1)
        app.buttons["Overlay"].tap()
        let afterPinch = try state("pinch-after")
        capture("A03-pinch")
        XCTAssertGreaterThan(try XCTUnwrap(afterPinch["zoom"]), try XCTUnwrap(beforePinch["zoom"]) + 0.2)
    }

    func testRotationGesture() throws {
        let beforeRotate = try state("rotate-before")
        app.buttons["Overlay"].tap()
        app.windows.firstMatch.rotate(.pi / 2, withVelocity: 1)
        Thread.sleep(forTimeInterval: 1)
        app.buttons["Overlay"].tap()
        let afterRotate = try state("rotate-after")
        let delta = abs(try XCTUnwrap(afterRotate["angle"]) - XCTUnwrap(beforeRotate["angle"])).truncatingRemainder(dividingBy: 360)
        XCTAssertGreaterThan(delta, 25)
        XCTAssertLessThan(delta, 335)
        capture("A03-rotation")
    }

    func testKeyboardAndOverlay() throws {
        let field = app.textFields["Overlay field"]
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        field.typeText("GLMap test")
        print("GLMapRNUI keyboard immediate value: \(String(describing: field.value))")
        let textArrived = expectation(for: NSPredicate(format: "value == %@", "GLMap test"), evaluatedWith: field)
        let textResult = XCTWaiter.wait(for: [textArrived], timeout: 5)
        print("GLMapRNUI keyboard settled value: \(String(describing: field.value))")
        capture("A04-keyboard")
        XCTAssertEqual(textResult, .completed, "Typed value: \(String(describing: field.value))")
        app.keyboards.buttons["Done"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        app.buttons["Overlay"].tap()
        XCTAssertFalse(field.exists)
        app.buttons["Overlay"].tap()
        XCTAssertEqual(field.value as? String, "GLMap test")
        try pan("after-keyboard")
    }

    func testNavigationAndOrientation() throws {
        app.buttons["Vienna"].tap()
        let beforeNavigation = try state("navigation-before")
        app.buttons["Leave map"].tap()
        XCTAssertTrue(app.staticTexts["Map removed"].waitForExistence(timeout: 5))
        capture("A05-removed")
        app.buttons["Return"].tap()
        XCTAssertTrue(app.buttons["Leave map"].waitForExistence(timeout: 10))
        try sameCamera(beforeNavigation, state("navigation-after"))
        capture("A05-restored")

        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["State"].waitForExistence(timeout: 5))
        XCTAssertGreaterThan(app.windows.firstMatch.frame.width, app.windows.firstMatch.frame.height)
        try sameCamera(beforeNavigation, state("landscape"))
        capture("A08-landscape")
        XCUIDevice.shared.orientation = .portrait
        try sameCamera(beforeNavigation, state("portrait"))
        capture("A08-portrait")
    }

    func testFiveBackgroundResumeCycles() throws {
        for cycle in 1...5 {
            app.buttons["Reset"].tap()
            let before = try state("background-\(cycle)-before")
            let count = taps()
            XCUIDevice.shared.press(.home)
            XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5)
                || app.wait(for: .runningBackgroundSuspended, timeout: 5))
            let dwell = expectation(description: "30 seconds in background")
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { dwell.fulfill() }
            wait(for: [dwell], timeout: 35)
            app.activate()
            XCTAssertTrue(app.buttons["State"].waitForExistence(timeout: 10))
            try sameCamera(before, state("resume-\(cycle)"))
            point().tap()
            Thread.sleep(forTimeInterval: 0.7)
            XCTAssertEqual(taps(), count + 1)
            try pan("resume-\(cycle)-pan")
            capture("A07-resume-\(cycle)")
        }
    }
}

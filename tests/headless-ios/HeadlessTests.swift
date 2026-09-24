import XCTest
final class HeadlessTests: XCTestCase {
    private func check(_ suffix: String, _ module: String) {
        let app = XCUIApplication(bundleIdentifier: "software.globus.modules.rn" + suffix)
        app.launch()
        XCTAssertTrue(app.staticTexts["PASS " + module].waitForExistence(timeout: 35), app.debugDescription)
        app.terminate()
    }
    func testCore() { check("core", "glmap-core") }
    func testSearch() { check("search", "glsearch") }
    func testRoute() { check("route", "glroute") }
}

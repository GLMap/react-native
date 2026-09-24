const {
  withProjectBuildGradle,
  withAppBuildGradle,
  withInfoPlist,
  withAppDelegate,
  withXcodeProject,
} = require("expo/config-plugins");
module.exports = function withGLMapLab(config) {
  config = withXcodeProject(config, (config) => {
    // RN's spm_dependency owns compilation/linking. Xcode must also embed the
    // package's dynamic binaries; linking its full product again duplicates
    // the static GLMapSwift code already included in the pod.
    const project = config.modResults;
    const objects = project.hash.project.objects;
    const targetId = project.getFirstTarget().uuid;
    const name = "Embed GLMap Frameworks";
    const phase = project.buildPhaseObject("PBXCopyFilesBuildPhase", name, targetId)
      ?? project.addBuildPhase([], "PBXCopyFilesBuildPhase", name, targetId, "frameworks").buildPhase;
    for (const framework of [
      "GLMap.framework",
      "GLMapCore.framework",
      "GLSearch.framework",
      "GLRoute.framework",
    ]) {
      if (phase.files.some(({ value }) => {
        const file = objects.PBXFileReference[objects.PBXBuildFile[value]?.fileRef];
        return file?.path?.replace(/^"|"$/g, "") === framework;
      })) continue;
      const fileId = project.generateUuid();
      const buildId = project.generateUuid();
      objects.PBXFileReference[fileId] = {
        isa: "PBXFileReference", path: framework,
        sourceTree: "BUILT_PRODUCTS_DIR", lastKnownFileType: "wrapper.framework",
      };
      objects.PBXFileReference[`${fileId}_comment`] = framework;
      objects.PBXBuildFile[buildId] = {
        isa: "PBXBuildFile", fileRef: fileId, fileRef_comment: framework,
        settings: { ATTRIBUTES: ["CodeSignOnCopy", "RemoveHeadersOnCopy"] },
      };
      objects.PBXBuildFile[`${buildId}_comment`] = framework;
      phase.files.push({ value: buildId, comment: framework });
    }
    return config;
  });
  config = withProjectBuildGradle(config, (config) => {
    // GLMap's local Release AAR uses NDK 29. The app must package its compatible libc++.
    const line = "ext.ndkVersion = '29.0.14206865'";
    if (!config.modResults.contents.includes(line)) {
      config.modResults.contents = config.modResults.contents.replace(
        'apply plugin: "expo-root-project"',
        `${line}\napply plugin: "expo-root-project"`,
      );
    }
    return config;
  });
  config = withAppBuildGradle(config, (config) => {
    const block =
      "android { androidResources { noCompress += ['vm', 'ttf', 'otf'] } }";
    if (!config.modResults.contents.includes(block))
      config.modResults.contents += `\n${block}\n`;
    return config;
  });
  // The pinned blank Expo template still starts UIWindow in AppDelegate. iOS 27
  // requires scenes; use Expo's own scene delegate and event forwarding.
  config = withInfoPlist(config, (config) => {
    config.modResults.NSLocationWhenInUseUsageDescription =
      "The demo shows your position on the map and navigates from it.";
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return config;
  });
  return withAppDelegate(config, (config) => {
    let source = config.modResults.contents;
    source = source.replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    source = source.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\n    window = UIWindow[\s\S]*?#endif/,
      "// ExpoAppSceneDelegate creates the window and starts React Native.",
    );
    config.modResults.contents = source;
    return config;
  });
};

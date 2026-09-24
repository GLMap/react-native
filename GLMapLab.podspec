Pod::Spec.new do |s|
  s.name = 'GLMapLab'
  s.version = '0.1.0-beta.1'
  s.summary = 'GLMap React Native laboratory wrapper'
  s.description = 'Local simulator experiment using the GLMap public SDK.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Globus'
  s.homepage = 'https://globus.software'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/*.swift'
  s.resource_bundles = { 'GLMapLabAssets' => ['assets/*'] }
  # The local Swift package contains the pinned, unpublished SDK draft.
  # A published wrapper will use the SDK package's release URL/version here.
  sdk = ENV['GLMAP_SDK_DIR']
  spm_dependency(s, url: sdk ? File.join(sdk, 'ios') : 'https://github.com/GLMap/GLMapSwift.git',
                 requirement: sdk ? {} : { kind: 'exactVersion', version: '2.2.0' },
                 products: ['GLMap', 'GLSearch', 'GLRoute'])
  # SwiftPM's source target and this CocoaPods target must process each XCFramework
  # into the same directory. Otherwise Xcode archives two same-named signatures.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CONFIGURATION_BUILD_DIR' => '$(PODS_CONFIGURATION_BUILD_DIR)'
  }
  # CocoaPods' generated consumers still address the module map in the pod's
  # conventional subdirectory. Preserve headers/assets there, not duplicate SDK binaries.
  s.script_phase = {
    :name => 'GLMap module headers',
    :execution_position => :before_compile,
    :input_files => ['$(PODS_ROOT)/Target Support Files/GLMapLab/GLMapLab.modulemap',
                     '$(PODS_ROOT)/Target Support Files/GLMapLab/GLMapLab-umbrella.h',
                     '$(PODS_CONFIGURATION_BUILD_DIR)/GLMapLabAssets.bundle'],
    :output_files => ['$(PODS_CONFIGURATION_BUILD_DIR)/GLMapLab/GLMapLab.modulemap',
                      '$(PODS_CONFIGURATION_BUILD_DIR)/GLMapLab/GLMapLab-umbrella.h',
                      '$(PODS_CONFIGURATION_BUILD_DIR)/GLMapLab/GLMapLabAssets.bundle'],
    :script => <<-SCRIPT
set -eu
mkdir -p "${PODS_CONFIGURATION_BUILD_DIR}/GLMapLab"
cp "${SCRIPT_INPUT_FILE_0}" "${SCRIPT_OUTPUT_FILE_0}"
cp "${SCRIPT_INPUT_FILE_1}" "${SCRIPT_OUTPUT_FILE_1}"
ditto "${SCRIPT_INPUT_FILE_2}" "${SCRIPT_OUTPUT_FILE_2}"
    SCRIPT
  }
  s.user_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"'
  }
end

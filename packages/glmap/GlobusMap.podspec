require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'GlobusMap'
  s.version = package.fetch('version')
  s.summary = 'GLMap React Native module'
  s.license = { :type => 'Proprietary' }
  s.author = 'Globus'
  s.homepage = 'https://globus.software'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GlobusMapCore', package.fetch('dependencies').fetch('@globus-software/glmap-core')
  s.source_files = 'ios/*.swift'
  sdk = ENV['GLMAP_SDK_DIR']
  spm_dependency(s, url: sdk ? File.join(sdk,'ios') : 'https://github.com/GLMap/GLMapSwift.git',
    requirement: sdk ? {} : {kind:'exactVersion',version:'2.2.0'},products:['GLMapBinary'])
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES', 'CONFIGURATION_BUILD_DIR' => '$(PODS_CONFIGURATION_BUILD_DIR)',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"',
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"'
  }
  s.user_target_xcconfig = {
    'LIBRARY_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"'
  }
  s.resource_bundles = { 'GlobusMapAssets' => ['assets/*'] }
  s.script_phase = { :name => 'GlobusMap module paths', :execution_position => :before_compile,
    :input_files => ['$(PODS_ROOT)/Target Support Files/GlobusMap/GlobusMap.modulemap', '$(PODS_ROOT)/Target Support Files/GlobusMap/GlobusMap-umbrella.h', '$(PODS_CONFIGURATION_BUILD_DIR)/GlobusMapAssets.bundle'], :output_files => ['$(PODS_CONFIGURATION_BUILD_DIR)/GlobusMap/GlobusMap.modulemap', '$(PODS_CONFIGURATION_BUILD_DIR)/GlobusMap/GlobusMap-umbrella.h', '$(PODS_CONFIGURATION_BUILD_DIR)/GlobusMap/GlobusMapAssets.bundle'],
    :script => <<-SCRIPT
set -eu
mkdir -p "${PODS_CONFIGURATION_BUILD_DIR}/GlobusMap"
cp "${SCRIPT_INPUT_FILE_0}" "${SCRIPT_OUTPUT_FILE_0}"
cp "${SCRIPT_INPUT_FILE_1}" "${SCRIPT_OUTPUT_FILE_1}"
ditto "${SCRIPT_INPUT_FILE_2}" "${SCRIPT_OUTPUT_FILE_2}"
    SCRIPT
  }
end

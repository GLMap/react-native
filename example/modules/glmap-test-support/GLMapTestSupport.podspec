Pod::Spec.new do |s|
  s.name = 'GLMapTestSupport'
  s.version = '0.0.0'
  s.summary = 'Example-only GLMap regression and benchmark support'
  s.license = { :type => 'Proprietary' }
  s.author = 'Globus'
  s.homepage = 'https://globus.software'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/*.swift'
  # The package pod owns the static SwiftPM product exactly once. Tests only import it.
  s.dependency 'GLMapLab'
  s.pod_target_xcconfig = {
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)/GLMapLab" "$(PODS_CONFIGURATION_BUILD_DIR)"',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"'
  }
end

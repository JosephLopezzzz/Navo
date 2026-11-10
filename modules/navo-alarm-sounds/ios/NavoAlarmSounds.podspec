Pod::Spec.new do |s|
  s.name = 'NavoAlarmSounds'
  s.version = '1.0.0'
  s.summary = 'Private local audio clips for Navo destination notifications.'
  s.description = s.summary
  s.license = { :type => 'Private' }
  s.author = 'Navo'
  s.homepage = 'https://github.com/JosephLopezzzz/Navo'
  s.source = { :git => 'https://github.com/JosephLopezzzz/Navo.git' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'UserNotifications'
  s.source_files = '**/*.swift'
end

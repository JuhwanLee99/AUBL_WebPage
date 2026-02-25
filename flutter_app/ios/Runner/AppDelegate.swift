import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // LaunchScreen → Flutter 첫 프레임 사이의 흰 화면 방지
    if let flutterVC = window?.rootViewController as? FlutterViewController {
      flutterVC.view.backgroundColor = UIColor(
        red: 15.0 / 255.0,
        green: 23.0 / 255.0,
        blue: 42.0 / 255.0,
        alpha: 1.0
      )
    }
    return result
  }
}

import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let appShellBackgroundColor = UIColor(red: 245.0 / 255.0, green: 247.0 / 255.0, blue: 251.0 / 255.0, alpha: 1.0)
    private let webCacheRevisionKey = "comergio.webCacheRevision"
    private let requiredWebCacheRevision = "2026102117"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NSLog("[Comergio][AppDelegate] didFinishLaunching start")
        configureFirebaseIfNeeded()
        markWebCacheRevisionIfNeeded()
        NSLog("[Comergio][AppDelegate] didFinishLaunching end firebaseConfigured=\(FirebaseApp.app() != nil)")
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        configuration.storyboard = UIStoryboard(name: "Main", bundle: nil)
        return configuration
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        applyAppShellAppearance()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    // Forward APNs device token to Firebase (required when FirebaseAppDelegateProxyEnabled = NO)
    // and notify Capacitor so @capacitor-firebase/messaging can finish FCM registration.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        NSLog("[Comergio][APNs] device token registered bytes=\(deviceToken.count)")
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        NSLog("[Comergio][APNs] Failed to register: \(error.localizedDescription)")
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let incomingURL = userActivity.webpageURL {
            return ApplicationDelegateProxy.shared.application(application, open: incomingURL, options: [:])
        }
        return false
    }

    private func markWebCacheRevisionIfNeeded() {
        let storedRevision = UserDefaults.standard.string(forKey: webCacheRevisionKey)
        if storedRevision == requiredWebCacheRevision {
            return
        }

        UserDefaults.standard.set(requiredWebCacheRevision, forKey: webCacheRevisionKey)
        NSLog("[Comergio][WebCache] revision=\(requiredWebCacheRevision) (runtime cache wipe disabled; iOS uses embedded shell)")
    }

    private func configureFirebaseIfNeeded() {
        if FirebaseApp.app() != nil {
            NSLog("[Comergio][Firebase] default app already configured")
            return
        }

        if let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: filePath) {
            NSLog("[Comergio][Firebase] configuring from plist path=\(filePath)")
            FirebaseApp.configure(options: options)
            NSLog("[Comergio][Firebase] configured from explicit plist")
            return
        }

        NSLog("[Comergio][Firebase] plist not found in bundle, falling back to default configure")
        FirebaseApp.configure()
        NSLog("[Comergio][Firebase] configured from default lookup")
    }

    func applyAppShellAppearance() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            guard let activeWindow = self.resolveActiveWindow() else {
                return
            }

            activeWindow.backgroundColor = self.appShellBackgroundColor
            activeWindow.rootViewController?.view.backgroundColor = self.appShellBackgroundColor

            guard let bridgeViewController = self.findBridgeViewController(from: activeWindow.rootViewController) else {
                return
            }

            bridgeViewController.view.backgroundColor = self.appShellBackgroundColor

            guard let webView = bridgeViewController.webView else {
                return
            }

            webView.isOpaque = false
            webView.backgroundColor = self.appShellBackgroundColor
            webView.scrollView.backgroundColor = self.appShellBackgroundColor
            webView.scrollView.bounces = false
            webView.scrollView.alwaysBounceVertical = false

            if #available(iOS 15.0, *) {
                webView.underPageBackgroundColor = self.appShellBackgroundColor
            }

            #if DEBUG
            if #available(iOS 16.4, *) {
                webView.isInspectable = true
            }
            #endif
        }
    }

    private func resolveActiveWindow() -> UIWindow? {
        if let window = window {
            return window
        }

        let sceneWindows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)

        return sceneWindows.first(where: \.isKeyWindow) ?? sceneWindows.first
    }

    private func findBridgeViewController(from viewController: UIViewController?) -> CAPBridgeViewController? {
        guard let viewController = viewController else {
            return nil
        }

        if let bridgeViewController = viewController as? CAPBridgeViewController {
            return bridgeViewController
        }

        for child in viewController.children {
            if let bridgeViewController = findBridgeViewController(from: child) {
                return bridgeViewController
            }
        }

        if let presented = viewController.presentedViewController,
           let bridgeViewController = findBridgeViewController(from: presented) {
            return bridgeViewController
        }

        return nil
    }
}

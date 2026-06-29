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
    private let requiredWebCacheRevision = "2025062801"

    override init() {
        super.init()
        NSLog("[Comergio][AppDelegate] init start")
        configureFirebaseIfNeeded()
        NSLog("[Comergio][AppDelegate] init end firebaseConfigured=\(FirebaseApp.app() != nil)")
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NSLog("[Comergio][AppDelegate] didFinishLaunching start firebaseConfigured=\(FirebaseApp.app() != nil)")
        clearRemoteWebCacheIfNeeded()
        configureFirebaseIfNeeded()
        applyAppShellAppearance()
        NSLog("[Comergio][AppDelegate] didFinishLaunching end firebaseConfigured=\(FirebaseApp.app() != nil)")
        return true
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
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
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
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[APNs] Failed to register: \(error)")
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

    private func clearRemoteWebCacheIfNeeded() {
        let storedRevision = UserDefaults.standard.string(forKey: webCacheRevisionKey)
        if storedRevision == requiredWebCacheRevision {
            return
        }

        NSLog("[Comergio][WebCache] clearing remote shell cache revision=\(requiredWebCacheRevision)")
        URLCache.shared.removeAllCachedResponses()

        let dataStore = WKWebsiteDataStore.default()
        let allTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let semaphore = DispatchSemaphore(value: 0)

        dataStore.removeData(ofTypes: allTypes, modifiedSince: Date(timeIntervalSince1970: 0)) {
            UserDefaults.standard.set(self.requiredWebCacheRevision, forKey: self.webCacheRevisionKey)
            NSLog("[Comergio][WebCache] cleared WKWebsiteDataStore revision=\(self.requiredWebCacheRevision)")
            semaphore.signal()
        }

        _ = semaphore.wait(timeout: .now() + 5)
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

    private func applyAppShellAppearance() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.window?.backgroundColor = self.appShellBackgroundColor
            self.window?.rootViewController?.view.backgroundColor = self.appShellBackgroundColor

            guard let bridgeViewController = self.findBridgeViewController(from: self.window?.rootViewController) else {
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
        }
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

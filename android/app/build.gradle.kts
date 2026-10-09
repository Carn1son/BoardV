plugins {
    id("com.android.application")
}

android {
    namespace = "com.carnison.boardview"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.carnison.boardview"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("BV_VCODE") ?: "2100010005").toInt()
        versionName = System.getenv("BV_VER") ?: "10.10.2026"
    }

    // One permanent key (decrypted in CI from src/keys/boardv.jks.enc) so every new APK installs over the old one.
    // Without it the build falls back to a throw-away debug key.
    val bvKeystore = System.getenv("BV_KEYSTORE")
    signingConfigs {
        if (bvKeystore != null) create("boardv") {
            storeFile = file(bvKeystore)
            storePassword = System.getenv("BV_KEYPASS")
            keyAlias = "boardv"
            keyPassword = System.getenv("BV_KEYPASS")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (bvKeystore != null) signingConfigs.getByName("boardv") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

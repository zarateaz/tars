package com.zarate.jearvis;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.camera2.CameraManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    public static volatile MainActivity instance;

    private WebView webView;
    private volatile boolean isRecordingVoice = false;
    private volatile boolean handsFreeWakeMode = false;
    private volatile boolean wakeLoopRunning = false;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean torchEnabled = false;
    private Handler mainHandler;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE_CHOOSER = 202;
    private static final String ASSET_ORIGIN = "file:///android_asset/";

    // Red nativa: un solo hilo (antes: un Thread nuevo por cada movimiento del trackpad)
    private final ExecutorService netExec = Executors.newSingleThreadExecutor();
    private volatile String authToken = "";
    private volatile String activeServerHost = "http://127.0.0.1:3000";
    private final Object moveLock = new Object();
    private int pendingDx = 0, pendingDy = 0;
    private boolean moveInFlight = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        ReminderStore.ensureChannel(this);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window win = getWindow();
        win.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        // FLAG_KEEP_SCREEN_ON solo mientras "Oye TARS" está activo (antes: siempre → batería)
        win.setStatusBarColor(0xFF020814);
        win.setNavigationBarColor(0xFF020814);

        requestAllRuntimePermissions();

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    int res = tts.setLanguage(new Locale("es", "MX"));
                    if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(new Locale("es", "ES"));
                    }
                    // Voz offline estilo TARS: más grave y pausada
                    tts.setPitch(0.72f);
                    tts.setSpeechRate(0.93f);
                    ttsReady = true;
                }
            }
        });

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF020814);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Depuración remota solo en builds de desarrollo
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        // SEGURIDAD: el WebView solo puede mostrar el HUD local. Cualquier enlace externo se abre
        // en el navegador del sistema. Antes, una página externa cargada aquí heredaba
        // ZarateBridge (root, llamadas, WhatsApp, contactos).
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String origin = String.valueOf(request.getOrigin());
                            if (origin.startsWith("file:")) {
                                request.grant(request.getResources());
                            } else {
                                request.deny();
                            }
                        } catch (Exception ignored) {}
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        webView.addJavascriptInterface(new ZarateBridge(), "ZarateBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/hud.html");
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return true;
        String u = uri.toString();
        if (u.startsWith(ASSET_ORIGIN)) return false; // permitido dentro del WebView
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
        return true;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Primero cierra modales del HUD; si no hay ninguno, manda la app al fondo (no la mata)
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.onNativeBack ? String(window.onNativeBack()) : 'false'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("true")) moveTaskToBack(true);
            }
        });
    }

    private void setKeepScreenOn(final boolean on) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    /** POST JSON al servidor activo con el token Stark. Devuelve el código HTTP o -1. */
    private int postJson(String path, String jsonBody, int connectMs, int readMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(activeServerHost + path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            if (!authToken.isEmpty()) conn.setRequestProperty("x-stark-token", authToken);
            conn.setConnectTimeout(connectMs);
            conn.setReadTimeout(readMs);
            conn.setDoOutput(true);
            byte[] out = jsonBody.getBytes("UTF-8");
            conn.setFixedLengthStreamingMode(out.length);
            OutputStream os = conn.getOutputStream();
            os.write(out);
            os.close();
            return conn.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.hasExtra("reminder_text")) {
            String rt = intent.getStringExtra("reminder_text");
            if (rt != null && !rt.isEmpty()) {
                onReminderFired(rt);
            }
        }
    }

    @Override
    protected void onDestroy() {
        isRecordingVoice = false;
        handsFreeWakeMode = false;
        netExec.shutdownNow();
        if (instance == this) {
            instance = null;
        }
        try {
            if (tts != null) tts.shutdown();
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void requestAllRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        String[] perms = new String[]{
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE
        };
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                needed.add("android.permission.POST_NOTIFICATIONS");
            }
        }
        if (!needed.isEmpty()) {
            requestPermissions(needed.toArray(new String[0]), 101);
        }
    }

    private void sendJs(final String script) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.evaluateJavascript(script, null);
                }
            }
        });
    }

    public void onReminderFired(final String text) {
        String safe = JSONObject.quote(text == null ? "" : text);
        sendJs("window.onNativeReminderFired && window.onNativeReminderFired(" + safe + ")");
    }

    public void onWhatsAppSent() {
        sendJs("window.onNativeWhatsAppSent && window.onNativeWhatsAppSent()");
    }

    public void onPhoneNotification(final String jsonStr) {
        String safe = JSONObject.quote(jsonStr == null ? "{}" : jsonStr);
        sendJs("window.onNativeNotification && window.onNativeNotification(" + safe + ")");
    }

    private static String normalizeText(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD);
        return n.replaceAll("\\p{InCombiningDiacriticalMarks}+", "").toLowerCase(Locale.ROOT).trim();
    }

    private static String normalizePhoneForWhatsApp(String rawPhone) {
        if (rawPhone == null) return "";
        String trimmed = rawPhone.trim();
        boolean hadPlus = trimmed.startsWith("+");
        String digits = trimmed.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return "";
        if (!hadPlus) {
            if (digits.length() == 9 && digits.startsWith("9")) {
                digits = "51" + digits;
            } else if (digits.length() == 10 && digits.startsWith("09")) {
                digits = "51" + digits.substring(1);
            }
        }
        return digits;
    }

    private List<String[]> queryContactsList() {
        List<String[]> list = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return list;
        }
        Set<String> seen = new LinkedHashSet<>();
        ContentResolver cr = getContentResolver();
        Cursor c = null;
        try {
            c = cr.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );
            if (c != null) {
                int idxName = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int idxNum = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (c.moveToNext()) {
                    String name = idxName >= 0 ? c.getString(idxName) : "";
                    String phone = idxNum >= 0 ? c.getString(idxNum) : "";
                    if (name == null) name = "";
                    if (phone == null) phone = "";
                    phone = phone.trim();
                    if (phone.isEmpty()) continue;
                    String key = name.trim() + "|" + phone.replaceAll("[^0-9+]", "");
                    if (seen.add(key)) {
                        list.add(new String[]{name.trim(), phone});
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return list;
    }

    private String[] resolveTargetPhone(String target) {
        String clean = target == null ? "" : target.trim();
        if (clean.isEmpty()) return null;
        String digits = clean.replaceAll("[^0-9+]", "");
        if (digits.replaceAll("[^0-9]", "").length() >= 7 && clean.matches("^[+0-9\\s\\-()]+$")) {
            return new String[]{clean, clean};
        }
        String normQuery = normalizeText(clean);
        List<String[]> contacts = queryContactsList();
        // 1. Exact match
        for (String[] pair : contacts) {
            if (normalizeText(pair[0]).equals(normQuery)) {
                return pair;
            }
        }
        // 2. Starts-with match
        for (String[] pair : contacts) {
            if (normalizeText(pair[0]).startsWith(normQuery)) {
                return pair;
            }
        }
        // 3. Substring match
        for (String[] pair : contacts) {
            if (normalizeText(pair[0]).contains(normQuery)) {
                return pair;
            }
        }
        // 4. Token match
        String[] tokens = normQuery.split("\\s+");
        for (String[] pair : contacts) {
            String nc = normalizeText(pair[0]);
            boolean allMatch = true;
            for (String tok : tokens) {
                if (!tok.isEmpty() && !nc.contains(tok)) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) return pair;
        }
        return null;
    }

    public class ZarateBridge {
        @JavascriptInterface
        public String getPhoneTelemetry() {
            try {
                IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
                Intent batteryStatus = registerReceiver(null, ifilter);
                int level = 100;
                int scale = 100;
                int tempTenths = 320;
                boolean charging = false;
                if (batteryStatus != null) {
                    level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                    tempTenths = batteryStatus.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 320);
                    int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                    charging = (status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                status == BatteryManager.BATTERY_STATUS_FULL);
                }
                int pct = (level >= 0 && scale > 0) ? (level * 100 / scale) : 100;
                double tempC = tempTenths / 10.0;

                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                long ramFreeMb = 4800;
                long ramTotalMb = 8192;
                if (am != null) {
                    am.getMemoryInfo(mi);
                    ramFreeMb = mi.availMem / (1024 * 1024);
                    ramTotalMb = mi.totalMem / (1024 * 1024);
                }

                AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                int volPct = 70;
                if (audio != null) {
                    int cur = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    if (max > 0) volPct = (cur * 100) / max;
                }

                JSONObject o = new JSONObject();
                o.put("device", Build.MODEL + " (Helio G91)");
                o.put("battery", pct);
                o.put("charging", charging);
                o.put("tempC", Math.round(tempC * 10.0) / 10.0);
                o.put("ramFreeMb", ramFreeMb);
                o.put("ramTotalMb", ramTotalMb);
                o.put("torchOn", torchEnabled);
                o.put("volumePct", volPct);
                o.put("a11yEnabled", JarvisAccessibilityService.isActive());
                return o.toString();
            } catch (Exception e) {
                return "{\"device\":\"TECNO KL6\",\"battery\":100,\"charging\":false,\"tempC\":32.0,\"ramFreeMb\":5000,\"ramTotalMb\":8192,\"torchOn\":false,\"volumePct\":75,\"a11yEnabled\":false}";
            }
        }

        @JavascriptInterface
        public boolean setTorch(boolean enable) {
            try {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (cm != null) {
                    String[] ids = cm.getCameraIdList();
                    if (ids.length > 0) {
                        cm.setTorchMode(ids[0], enable);
                        torchEnabled = enable;
                        vibrate(45);
                        return true;
                    }
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public int setPhoneVolume(int percent) {
            try {
                AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (audio != null) {
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int target = Math.max(0, Math.min(max, Math.round((percent / 100.0f) * max)));
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, AudioManager.FLAG_SHOW_UI);
                    vibrate(30);
                    return (target * 100) / Math.max(1, max);
                }
            } catch (Exception ignored) {}
            return percent;
        }

        @JavascriptInterface
        public String openApp(String query) {
            try {
                String q = query.toLowerCase(Locale.ROOT).trim();
                PackageManager pm = getPackageManager();

                if (q.contains("youtube") && q.contains(":")) {
                    String search = q.substring(q.indexOf(":") + 1).trim();
                    Intent yt = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(search)));
                    yt.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(yt);
                    return "Abriendo YouTube con: " + search;
                }

                String targetPkg = null;
                if (q.contains("termux") || q.contains("terminal") || q.contains("arch") || q.contains("consola")) {
                    targetPkg = "com.termux";
                } else if (q.contains("whatsapp")) {
                    targetPkg = "com.whatsapp";
                } else if (q.contains("youtube")) {
                    targetPkg = "com.google.android.youtube";
                } else if (q.contains("chrome") || q.contains("navegador")) {
                    targetPkg = "com.android.chrome";
                } else if (q.contains("ajuste") || q.contains("config")) {
                    targetPkg = "com.android.settings";
                } else if (q.contains("camara") || q.contains("cámara") || q.contains("foto")) {
                    Intent cam = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(cam);
                    return "Cámara iniciada en el Tecno Spark 30.";
                }

                if (targetPkg != null) {
                    Intent launch = pm.getLaunchIntentForPackage(targetPkg);
                    if (launch != null) {
                        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(launch);
                        vibrate(50);
                        return "Aplicación iniciada: " + targetPkg;
                    }
                }

                List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
                for (ApplicationInfo app : apps) {
                    String label = String.valueOf(pm.getApplicationLabel(app)).toLowerCase(Locale.ROOT);
                    String pkg = app.packageName.toLowerCase(Locale.ROOT);
                    if (label.contains(q) || pkg.contains(q)) {
                        Intent launch = pm.getLaunchIntentForPackage(app.packageName);
                        if (launch != null) {
                            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(launch);
                            vibrate(50);
                            return "Abriendo " + pm.getApplicationLabel(app);
                        }
                    }
                }
            } catch (Exception e) {
                return "Error al abrir app: " + e.getMessage();
            }
            return "No encontré esa aplicación instalada en el teléfono.";
        }

        @JavascriptInterface
        public String getContactsJson() {
            JSONArray arr = new JSONArray();
            List<String[]> contacts = queryContactsList();
            for (String[] pair : contacts) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("name", pair[0]);
                    o.put("phone", pair[1]);
                    arr.put(o);
                } catch (Exception ignored) {}
            }
            return arr.toString();
        }

        @JavascriptInterface
        public String sendWhatsApp(String target, String message, boolean autoSend) {
            try {
                if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED
                        && !String.valueOf(target).matches(".*[0-9]{7,}.*")) {
                    requestAllRuntimePermissions();
                    return "Necesito permiso de Contactos para buscar a " + target + ". Acepta el permiso en pantalla e inténtalo de nuevo.";
                }
                String[] resolved = resolveTargetPhone(target);
                if (resolved == null) {
                    return "No encontré ningún contacto llamado '" + target + "' en tu agenda.";
                }
                String waPhone = normalizePhoneForWhatsApp(resolved[1]);
                if (waPhone.isEmpty()) {
                    return "El número de " + resolved[0] + " no es válido para WhatsApp.";
                }

                String safeMsg = message == null ? "" : message.trim();
                String url = "https://api.whatsapp.com/send?phone=" + Uri.encode(waPhone)
                        + (safeMsg.isEmpty() ? "" : "&text=" + Uri.encode(safeMsg));

                if (autoSend && JarvisAccessibilityService.isActive()) {
                    JarvisAccessibilityService.arm();
                }

                PackageManager pm = getPackageManager();
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                boolean launched = false;
                for (String pkg : new String[]{"com.whatsapp", "com.whatsapp.w4b"}) {
                    try {
                        pm.getPackageInfo(pkg, 0);
                        intent.setPackage(pkg);
                        startActivity(intent);
                        launched = true;
                        break;
                    } catch (Exception ignored) {}
                }
                if (!launched) {
                    intent.setPackage(null);
                    startActivity(intent);
                }
                vibrate(55);
                if (autoSend && JarvisAccessibilityService.isActive()) {
                    return "Abriendo chat de WhatsApp con " + resolved[0] + " y enviando automáticamente: \"" + safeMsg + "\".";
                }
                return "Chat de WhatsApp preparado con " + resolved[0] + " (" + resolved[1] + "). Mensaje: \"" + safeMsg + "\".";
            } catch (Exception e) {
                return "Error al abrir WhatsApp: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public String callContact(String target) {
            try {
                String[] resolved = resolveTargetPhone(target);
                if (resolved == null) {
                    return "No encontré el contacto '" + target + "' para llamar.";
                }
                String num = resolved[1].replaceAll("[^0-9+*#]", "");
                Intent intent;
                if (checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
                    intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(num)));
                } else {
                    intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(num)));
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                vibrate(55);
                return "Llamando a " + resolved[0] + " (" + resolved[1] + ").";
            } catch (Exception e) {
                return "Error al iniciar llamada: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public String addReminder(long timeMs, String text) {
            try {
                String cleanText = (text == null || text.trim().isEmpty()) ? "Recordatorio de Zarate" : text.trim();
                long safeTime = Math.max(System.currentTimeMillis() + 3000L, timeMs);
                String id = ReminderStore.add(MainActivity.this, safeTime, cleanText);

                ReminderStore.ensureChannel(MainActivity.this);
                String hhmm = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(safeTime));
                Notification confirm = new Notification.Builder(MainActivity.this, ReminderStore.CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_jarvis)
                        .setColor(0xFF00F0FF)
                        .setContentTitle("⏰ Recordatorio programado (" + hhmm + ")")
                        .setContentText(cleanText)
                        .setAutoCancel(true)
                        .build();
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.notify((id + "_ack").hashCode(), confirm);
                vibrate(45);
                return id;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String getRemindersJson() {
            return ReminderStore.load(MainActivity.this).toString();
        }

        @JavascriptInterface
        public void deleteReminder(String id) {
            ReminderStore.remove(MainActivity.this, id);
            vibrate(25);
        }

        @JavascriptInterface
        public void openAccessibilitySettings() {
            try {
                Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String getPhoneClipboard() {
            final String[] result = new String[]{""};
            final CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    try {
                        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                        if (cm != null && cm.hasPrimaryClip()) {
                            ClipData cd = cm.getPrimaryClip();
                            if (cd != null && cd.getItemCount() > 0) {
                                CharSequence cs = cd.getItemAt(0).coerceToText(MainActivity.this);
                                if (cs != null) result[0] = cs.toString();
                            }
                        }
                    } catch (Exception ignored) {}
                    latch.countDown();
                }
            });
            try { latch.await(1000, TimeUnit.MILLISECONDS); } catch (InterruptedException ignored) {}
            return result[0];
        }

        @JavascriptInterface
        public boolean setPhoneClipboard(final String text) {
            try {
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                            if (cm != null) {
                                cm.setPrimaryClip(ClipData.newPlainText("TARS", text == null ? "" : text));
                            }
                        } catch (Exception ignored) {}
                    }
                });
                vibrate(25);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String getRecentNotificationsJson() {
            return JarvisNotificationService.getRecentJson();
        }

        @JavascriptInterface
        public boolean isNotificationListenerEnabled() {
            try {
                String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
                return flat != null && flat.contains(getPackageName());
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void openNotificationListenerSettings() {
            try {
                Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void strobeTorch(final int pulses) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                        if (cm == null) return;
                        String[] ids = cm.getCameraIdList();
                        if (ids.length == 0) return;
                        int count = Math.max(1, Math.min(12, pulses));
                        for (int i = 0; i < count; i++) {
                            cm.setTorchMode(ids[0], true);
                            Thread.sleep(110);
                            cm.setTorchMode(ids[0], false);
                            Thread.sleep(110);
                        }
                        torchEnabled = false;
                    } catch (Exception ignored) {}
                }
            }).start();
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) {
                    v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void speakOffline(String text) {
            if (ttsReady && tts != null && text != null) {
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "zarate_utt");
            }
        }

        @JavascriptInterface
        public String getPhoneTailscaleIp() {
            try {
                Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
                while (ifaces != null && ifaces.hasMoreElements()) {
                    NetworkInterface ni = ifaces.nextElement();
                    if (!ni.isUp() || ni.isLoopback()) continue;
                    Enumeration<InetAddress> addrs = ni.getInetAddresses();
                    while (addrs.hasMoreElements()) {
                        InetAddress addr = addrs.nextElement();
                        if (addr instanceof Inet4Address) {
                            String ip = addr.getHostAddress();
                            if (ip != null && ip.startsWith("100.")) {
                                return ip;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface
        public String openTailscale() {
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage("com.tailscale.ipn");
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(launch);
                    vibrate(40);
                    return "Abriendo Tailscale VPN. Activa tu sesión para enlace global sin límites.";
                }
                return "Tailscale no está instalado todavía.";
            } catch (Exception e) {
                return "Error al abrir Tailscale: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public boolean isHandsFreeEnabled() {
            return handsFreeWakeMode;
        }

        @JavascriptInterface
        public boolean setHandsFreeWakeWord(boolean enabled) {
            if (enabled) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    requestAllRuntimePermissions();
                    sendJs("window.onNativeSpeechError && window.onNativeSpeechError('Concede permiso de micrófono para activar Oye TARS.')");
                    handsFreeWakeMode = false;
                    return false;
                }
                handsFreeWakeMode = true;
                setKeepScreenOn(true);
                if (!wakeLoopRunning) {
                    wakeLoopRunning = true;
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            runWakeWordLoop();
                        }
                    }).start();
                }
                vibrate(30);
                return true;
            } else {
                handsFreeWakeMode = false;
                setKeepScreenOn(false);
                vibrate(20);
                return false;
            }
        }

        private AudioRecord openBestAudioRecord(int sampleRate, int bufBytes) {
            int[] sources = new int[]{
                MediaRecorder.AudioSource.MIC,
                MediaRecorder.AudioSource.DEFAULT,
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                MediaRecorder.AudioSource.CAMCORDER
            };
            for (int src : sources) {
                try {
                    AudioRecord candidate = new AudioRecord(
                        src,
                        sampleRate,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufBytes
                    );
                    if (candidate.getState() == AudioRecord.STATE_INITIALIZED) {
                        return candidate;
                    } else {
                        candidate.release();
                    }
                } catch (Exception ignored) {}
            }
            return null;
        }

        private String normalizeJarvisTranscript(String s) {
            if (s == null) return "";
            // "TARS" y cómo lo transcribe el reconocimiento en español (+ "Jarvis" por costumbre)
            return s.replaceAll(
                "(?i)\\b(t\\.?a\\.?r\\.?s\\.?|tarz|tarss|thars|tharz|dars|tarts|tarsh|taars|"
                + "jarvis|yarbis|jarbis|harvis|jervis|yervis|jearvis|jearcis|jarcis|garvis|jarvi|yarvis)\\b",
                "TARS"
            ).trim();
        }

        private void runWakeWordLoop() {
            final int sampleRate = 16000;
            final int chunkSamples = 1600; // 100ms
            try {
                while (handsFreeWakeMode) {
                    if (isRecordingVoice) {
                        try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                        continue;
                    }

                    AudioRecord recorder = null;
                    try {
                        int minBuf = AudioRecord.getMinBufferSize(
                            sampleRate,
                            AudioFormat.CHANNEL_IN_MONO,
                            AudioFormat.ENCODING_PCM_16BIT
                        );
                        int bufBytes = Math.max(minBuf, chunkSamples * 2 * 4);
                        recorder = openBestAudioRecord(sampleRate, bufBytes);
                        if (recorder == null) {
                            handsFreeWakeMode = false;
                            setKeepScreenOn(false);
                            sendJs("window.onNativeWakeState && window.onNativeWakeState(false)");
                            break;
                        }

                        recorder.startRecording();
                        ByteArrayOutputStream pcmOut = new ByteArrayOutputStream();
                        List<byte[]> preRoll = new ArrayList<>();
                        short[] buf = new short[chunkSamples];

                        double floor = 0.0;
                        int floorCount = 0;
                        boolean speechStarted = false;
                        int idleChunks = 0;
                        int speechChunks = 0;
                        int postSpeechChunks = 0;
                        int silentChunks = 0;

                        while (handsFreeWakeMode && !isRecordingVoice) {
                            int read = recorder.read(buf, 0, chunkSamples);
                            if (read <= 0) continue;

                            byte[] chunkBytes = new byte[read * 2];
                            double sumSq = 0.0;
                            for (int j = 0; j < read; j++) {
                                short s = buf[j];
                                sumSq += (double) s * (double) s;
                                chunkBytes[j * 2] = (byte) (s & 0xff);
                                chunkBytes[j * 2 + 1] = (byte) ((s >> 8) & 0xff);
                            }

                            double rms = Math.sqrt(sumSq / read);
                            if (!speechStarted) {
                                preRoll.add(chunkBytes);
                                if (preRoll.size() > 4) preRoll.remove(0);

                                if (floorCount < 3) {
                                    floor = (floor * floorCount + rms) / (floorCount + 1);
                                    floorCount++;
                                } else {
                                    floor = floor * 0.9 + Math.min(rms, floor * 1.5) * 0.1;
                                }

                                if (rms > Math.max(240.0, floor * 2.3)) {
                                    speechStarted = true;
                                    for (byte[] pb : preRoll) {
                                        pcmOut.write(pb, 0, pb.length);
                                    }
                                    speechChunks = 1;
                                    postSpeechChunks = 1;
                                    silentChunks = 0;
                                } else {
                                    idleChunks++;
                                    if (idleChunks >= 60) break; // recalibrate periodically
                                }
                            } else {
                                pcmOut.write(chunkBytes, 0, chunkBytes.length);
                                postSpeechChunks++;
                                if (rms > Math.max(185.0, floor * 1.7)) {
                                    speechChunks++;
                                    silentChunks = 0;
                                } else {
                                    silentChunks++;
                                    if (speechChunks >= 4 && silentChunks >= 8) break;
                                    if (postSpeechChunks >= 38) break;
                                }
                            }
                        }

                        try { recorder.stop(); } catch (Exception ignored) {}
                        try { recorder.release(); } catch (Exception ignored) {}
                        recorder = null;

                        if (!handsFreeWakeMode || isRecordingVoice || !speechStarted || speechChunks < 4) {
                            continue;
                        }

                        byte[] pcmBytes = pcmOut.toByteArray();
                        if (pcmBytes.length < 6400) continue;

                        String transcript = normalizeJarvisTranscript(recognizePcmGoogleV2(pcmBytes, "es-PE"));
                        if (transcript.isEmpty()) {
                            transcript = normalizeJarvisTranscript(recognizePcmGoogleV2(pcmBytes, "es-419"));
                        }
                        if (transcript.isEmpty()) continue;

                        sendJs("window.onNativeWakeHeard && window.onNativeWakeHeard(" + JSONObject.quote(transcript) + ")");

                        int idx = transcript.indexOf("TARS");
                        if (idx >= 0) {
                            vibrate(50);
                            String remainder = transcript.substring(idx + 4).replaceAll("^[\\s,:;.!-]+", "").trim();
                            if (remainder.length() >= 3) {
                                sendJs("window.onNativeSpeechResult && window.onNativeSpeechResult(" + JSONObject.quote(remainder) + ", true)");
                            } else {
                                if (recorder != null) {
                                    try { recorder.stop(); } catch (Exception ignored) {}
                                    try { recorder.release(); } catch (Exception ignored) {}
                                    recorder = null;
                                }
                                startVoiceListening();
                            }
                        }
                    } catch (Exception ignored) {
                        try { Thread.sleep(300); } catch (InterruptedException ie) {}
                    } finally {
                        if (recorder != null) {
                            try { recorder.stop(); } catch (Exception ignored) {}
                            try { recorder.release(); } catch (Exception ignored) {}
                        }
                    }
                }
            } finally {
                wakeLoopRunning = false;
            }
        }

        @JavascriptInterface
        public void setActiveServer(String url) {
            if (url != null && url.trim().matches("^https?://.+")) {
                activeServerHost = url.trim().replaceAll("/+$", "");
            }
        }

        @JavascriptInterface
        public void setAuthToken(String token) {
            authToken = token == null ? "" : token.trim();
        }

        /** Movimientos del trackpad: se acumulan y se envía uno a la vez (antes: 1 hilo por evento, timeout 120 ms). */
        @JavascriptInterface
        public void sendRemoteMove(final int dx, final int dy) {
            synchronized (moveLock) {
                pendingDx += dx;
                pendingDy += dy;
                if (moveInFlight) return;
                moveInFlight = true;
            }
            try {
                netExec.execute(new Runnable() {
                    @Override
                    public void run() {
                        while (true) {
                            int mx, my;
                            synchronized (moveLock) {
                                mx = pendingDx; my = pendingDy;
                                pendingDx = 0; pendingDy = 0;
                                if (mx == 0 && my == 0) { moveInFlight = false; return; }
                            }
                            postJson("/api/remote-input",
                                "{\"action\":\"move\",\"dx\":" + mx + ",\"dy\":" + my + "}", 1500, 1500);
                        }
                    }
                });
            } catch (Exception e) {
                synchronized (moveLock) { moveInFlight = false; }
            }
        }

        @JavascriptInterface
        public void sendRemoteAction(final String action) {
            try {
                final String body = new JSONObject().put("action", action == null ? "" : action).toString();
                netExec.execute(new Runnable() {
                    @Override
                    public void run() {
                        postJson("/api/remote-input", body, 1500, 2500);
                    }
                });
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String executeRootCommand(final String cmd) {
            final StringBuilder output = new StringBuilder();
            try {
                Process process = Runtime.getRuntime().exec("su");
                DataOutputStream os = new DataOutputStream(process.getOutputStream());
                os.writeBytes(cmd + "\nexit\n");
                os.flush();
                BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
                process.waitFor();
                return output.toString().trim();
            } catch (Exception e) {
                return "ERR: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public boolean isRootAvailable() {
            try {
                Process p = Runtime.getRuntime().exec(new String[]{"su", "-c", "id"});
                BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
                String out = r.readLine();
                p.waitFor();
                return out != null && out.contains("uid=0");
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String setCpuGovernor(final String governor) {
            String g = (governor == null || governor.isEmpty()) ? "performance" : governor.trim();
            if (!g.matches("^(performance|powersave|schedutil|ondemand|conservative|interactive)$")) {
                return "Governor no permitido: " + g;
            }
            return executeRootCommand(
                "for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo " + g + " > $f 2>/dev/null; done; " +
                "echo 'Governor establecido en: ' $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null)"
            );
        }

        @JavascriptInterface
        public String dropRamCaches() {
            return executeRootCommand("sync && echo 3 > /proc/sys/vm/drop_caches && echo 'Memoria RAM purificada a nivel Kernel.'");
        }

        @JavascriptInterface
        public String setBatteryChargingEnabled(final boolean enabled) {
            String val = enabled ? "1" : "0";
            return executeRootCommand(
                "echo " + val + " > /sys/class/power_supply/battery/charging_enabled 2>/dev/null; " +
                "echo " + (enabled ? "0" : "1") + " > /sys/class/power_supply/battery/input_suspend 2>/dev/null; " +
                "echo 'Batería: " + (enabled ? "Carga Normal Activa" : "Bypass Hardware (Batería Eterna / Cable Directo)") + "'"
            );
        }

        @JavascriptInterface
        public String rootTap(final int x, final int y) {
            return executeRootCommand("input tap " + x + " " + y);
        }

        @JavascriptInterface
        public String rootSwipe(final int x1, final int y1, final int x2, final int y2, final int duration) {
            return executeRootCommand("input swipe " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + duration);
        }

        @JavascriptInterface
        public String rootTypeText(final String text) {
            String safe = (text == null ? "" : text).replace("'", "'\\''");
            return executeRootCommand("input text '" + safe + "'");
        }

        @JavascriptInterface
        public String rootKey(final int keycode) {
            return executeRootCommand("input keyevent " + keycode);
        }

        @JavascriptInterface
        public String setGlobalAirplane(final boolean enable) {
            return executeRootCommand("cmd connectivity airplane-mode " + (enable ? "enable" : "disable"));
        }

        @JavascriptInterface
        public String setMobileData(final boolean enable) {
            return executeRootCommand("svc data " + (enable ? "enable" : "disable"));
        }

        @JavascriptInterface
        public String setWifiRadio(final boolean enable) {
            return executeRootCommand("svc wifi " + (enable ? "enable" : "disable"));
        }

        @JavascriptInterface
        public String rootTakeScreenshot() {
            String path = "/sdcard/Pictures/jearvis_root_snap.png";
            return executeRootCommand("screencap -p " + path + " && echo 'Captura guardada en: " + path + "'");
        }

        @JavascriptInterface
        public void startVoiceListening() {
            mainHandler.post(new Runnable() {
                @Override
                public void run() {
                    if (isRecordingVoice) {
                        // Tocar el reactor mientras graba finaliza la captura de inmediato
                        isRecordingVoice = false;
                        vibrate(25);
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        requestAllRuntimePermissions();
                        sendJs("window.onNativeSpeechError && window.onNativeSpeechError('Concede permiso de micrófono primero.')");
                        return;
                    }
                    startDirectVoiceLoop();
                }
            });
        }

        private void startDirectVoiceLoop() {
            isRecordingVoice = true;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    AudioRecord recorder = null;
                    try {
                        int sampleRate = 16000;
                        int chunkSamples = 1600; // 100ms
                        int minBuf = AudioRecord.getMinBufferSize(
                            sampleRate,
                            AudioFormat.CHANNEL_IN_MONO,
                            AudioFormat.ENCODING_PCM_16BIT
                        );
                        int bufBytes = Math.max(minBuf, chunkSamples * 2 * 4);

                        recorder = openBestAudioRecord(sampleRate, bufBytes);
                        if (recorder == null) {
                            isRecordingVoice = false;
                            sendJs("window.onNativeSpeechError && window.onNativeSpeechError('No se pudo inicializar el micrófono.')");
                            return;
                        }

                        recorder.startRecording();
                        vibrate(35);
                        sendJs("window.onNativeMicState && window.onNativeMicState('LISTENING')");

                        ByteArrayOutputStream pcmOut = new ByteArrayOutputStream();
                        short[] buf = new short[chunkSamples];
                        byte[] byteBuf = new byte[chunkSamples * 2];

                        double floor = 0.0;
                        int floorCount = 0;
                        boolean speechStarted = false;
                        int speechChunks = 0;
                        int silentChunks = 0;
                        int maxChunks = 80; // 8.0s max

                        for (int i = 0; i < maxChunks && isRecordingVoice; i++) {
                            int read = recorder.read(buf, 0, chunkSamples);
                            if (read <= 0) continue;

                            double sumSq = 0.0;
                            for (int j = 0; j < read; j++) {
                                short s = buf[j];
                                // Boost software gain by 2.2x for crystal-clear STT on Tecno Spark 30
                                int boosted = (int) (s * 2.2);
                                if (boosted > 32767) boosted = 32767;
                                else if (boosted < -32768) boosted = -32768;
                                short bs = (short) boosted;

                                sumSq += (double) bs * (double) bs;
                                byteBuf[j * 2] = (byte) (bs & 0xff);
                                byteBuf[j * 2 + 1] = (byte) ((bs >> 8) & 0xff);
                            }
                            pcmOut.write(byteBuf, 0, read * 2);

                            double rms = Math.sqrt(sumSq / read);
                            double uiRms = Math.min(12.0, rms / 110.0);
                            sendJs("window.onNativeMicRms && window.onNativeMicRms(" + String.format(Locale.US, "%.2f", uiRms) + ")");

                            if (floorCount < 3) {
                                floor = (floor * floorCount + rms) / (floorCount + 1);
                                floorCount++;
                            }

                            if (!speechStarted) {
                                if (rms > Math.max(35.0, floor * 1.10)) {
                                    speechStarted = true;
                                    speechChunks = 1;
                                    silentChunks = 0;
                                }
                            } else {
                                if (rms > Math.max(30.0, floor * 1.05)) {
                                    speechChunks++;
                                    silentChunks = 0;
                                } else {
                                    silentChunks++;
                                    // Detener si hay 1.2s de silencio tras al menos 400ms de voz
                                    if (speechChunks >= 4 && silentChunks >= 12) {
                                        break;
                                    }
                                }
                            }
                        }

                        isRecordingVoice = false;
                        sendJs("window.onNativeMicState && window.onNativeMicState('PROCESSING')");

                        try { recorder.stop(); } catch (Exception ignored) {}
                        try { recorder.release(); } catch (Exception ignored) {}
                        recorder = null;

                        byte[] pcmBytes = pcmOut.toByteArray();
                        if (pcmBytes.length < 3200) {
                            sendJs("window.onNativeSpeechError && window.onNativeSpeechError('Audio muy corto, toca la esfera y habla.')");
                            return;
                        }

                        // Triple STT Redundancy: Google Speech API v2 (es-PE), fallback (es-419), fallback Laptop Neural STT
                        String transcript = recognizePcmGoogleV2(pcmBytes, "es-PE");
                        if (transcript.isEmpty()) {
                            transcript = recognizePcmGoogleV2(pcmBytes, "es-419");
                        }
                        if (transcript.isEmpty()) {
                            transcript = transcribeWithLaptop(pcmBytes);
                        }

                        if (!transcript.isEmpty()) {
                            transcript = normalizeJarvisTranscript(transcript);
                            String quoted = JSONObject.quote(transcript);
                            sendJs("window.onNativeSpeechResult && window.onNativeSpeechResult(" + quoted + ", true)");
                        } else {
                            sendJs("window.onNativeSpeechError && window.onNativeSpeechError('No se distinguió la voz, intenta hablar un poco más fuerte.')");
                        }
                    } catch (Exception e) {
                        isRecordingVoice = false;
                        String qErr = JSONObject.quote("Error de voz: " + e.getMessage());
                        sendJs("window.onNativeSpeechError && window.onNativeSpeechError(" + qErr + ")");
                    } finally {
                        isRecordingVoice = false;
                        if (recorder != null) {
                            try { recorder.stop(); } catch (Exception ignored) {}
                            try { recorder.release(); } catch (Exception ignored) {}
                        }
                    }
                }
            }).start();
        }

        private String transcribeWithLaptop(byte[] pcmBytes) {
            List<String> hosts = new ArrayList<>();
            if (activeServerHost != null && !activeServerHost.trim().isEmpty()) {
                hosts.add(activeServerHost.trim());
            }

            for (String host : hosts) {
                HttpURLConnection conn = null;
                try {
                    byte[] wavBytes = pcmToWav(pcmBytes, 16000, 1);
                    String boundary = "===JARVIS_" + System.currentTimeMillis() + "===";
                    URL url = new URL(host + "/api/transcribe");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                    if (!authToken.isEmpty()) conn.setRequestProperty("x-stark-token", authToken);

                    OutputStream os = conn.getOutputStream();
                    PrintWriter writer = new PrintWriter(new OutputStreamWriter(os, "UTF-8"), true);
                    writer.append("--" + boundary).append("\r\n");
                    writer.append("Content-Disposition: form-data; name=\"audio\"; filename=\"mic.wav\"").append("\r\n");
                    writer.append("Content-Type: audio/wav").append("\r\n\r\n");
                    writer.flush();
                    os.write(wavBytes);
                    os.flush();
                    writer.append("\r\n").flush();
                    writer.append("--" + boundary + "--").append("\r\n").flush();
                    writer.close();

                    if (conn.getResponseCode() == 200) {
                        BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = br.readLine()) != null) sb.append(line);
                        br.close();
                        JSONObject json = new JSONObject(sb.toString());
                        if (json.optBoolean("success", false)) {
                            String txt = json.optString("text", "").trim();
                            if (!txt.isEmpty()) return txt;
                        }
                    }
                } catch (Exception ignored) {}
                finally {
                    if (conn != null) conn.disconnect();
                }
            }
            return "";
        }

        private byte[] pcmToWav(byte[] pcm, int sampleRate, int channels) {
            int totalDataLen = pcm.length + 36;
            int byteRate = sampleRate * channels * 2;
            byte[] header = new byte[44];
            header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
            header[4] = (byte) (totalDataLen & 0xff);
            header[5] = (byte) ((totalDataLen >> 8) & 0xff);
            header[6] = (byte) ((totalDataLen >> 16) & 0xff);
            header[7] = (byte) ((totalDataLen >> 24) & 0xff);
            header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';
            header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
            header[16] = 16; header[17] = 0; header[18] = 0; header[19] = 0;
            header[20] = 1; header[21] = 0;
            header[22] = (byte) channels; header[23] = 0;
            header[24] = (byte) (sampleRate & 0xff);
            header[25] = (byte) ((sampleRate >> 8) & 0xff);
            header[26] = (byte) ((sampleRate >> 16) & 0xff);
            header[27] = (byte) ((sampleRate >> 24) & 0xff);
            header[28] = (byte) (byteRate & 0xff);
            header[29] = (byte) ((byteRate >> 8) & 0xff);
            header[30] = (byte) ((byteRate >> 16) & 0xff);
            header[31] = (byte) ((byteRate >> 24) & 0xff);
            header[32] = (byte) (channels * 2); header[33] = 0;
            header[34] = 16; header[35] = 0;
            header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
            header[40] = (byte) (pcm.length & 0xff);
            header[41] = (byte) ((pcm.length >> 8) & 0xff);
            header[42] = (byte) ((pcm.length >> 16) & 0xff);
            header[43] = (byte) ((pcm.length >> 24) & 0xff);
            byte[] wav = new byte[44 + pcm.length];
            System.arraycopy(header, 0, wav, 0, 44);
            System.arraycopy(pcm, 0, wav, 44, pcm.length);
            return wav;
        }

        private String recognizePcmGoogleV2(byte[] pcmBytes, String lang) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(
                    "https://www.google.com/speech-api/v2/recognize?client=chromium&lang="
                    + lang + "&key=AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw&pFilter=0"
                );
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(7000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "audio/l16; rate=16000");
                conn.setFixedLengthStreamingMode(pcmBytes.length);

                OutputStream os = conn.getOutputStream();
                os.write(pcmBytes);
                os.flush();
                os.close();

                if (conn.getResponseCode() != 200) return "";
                BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                String line;
                String bestText = "";
                double bestConf = -1.0;
                while ((line = br.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty()) continue;
                    try {
                        JSONObject obj = new JSONObject(line);
                        JSONArray results = obj.optJSONArray("result");
                        if (results == null || results.length() == 0) continue;
                        JSONArray alts = results.getJSONObject(0).optJSONArray("alternative");
                        if (alts == null || alts.length() == 0) continue;
                        for (int i = 0; i < alts.length(); i++) {
                            JSONObject alt = alts.getJSONObject(i);
                            String t = alt.optString("transcript", "").trim();
                            double c = alt.optDouble("confidence", i == 0 ? 0.5 : 0.0);
                            if (!t.isEmpty() && (bestText.isEmpty() || c > bestConf)) {
                                bestText = t;
                                bestConf = c;
                            }
                        }
                    } catch (Exception ignored) {}
                }
                br.close();
                return bestText;
            } catch (Exception e) {
                return "";
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }
}

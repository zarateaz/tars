package com.zarate.jearvis;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.Locale;

/** Fires reminders: Stark-style notification + spoken alert even with the app closed. */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        // Receptor NO exportado: solo lo activan nuestras propias alarmas (PendingIntent).
        // Antes estaba exportado y cualquier app podía crear recordatorios o hacer hablar al teléfono.
        String action = intent.getAction();

        String id = intent.getStringExtra("id");
        String text = intent.getStringExtra("text");
        if (id == null) return;
        if (text == null || text.isEmpty()) text = "Tienes un recordatorio pendiente.";

        if (ReminderStore.ACTION_SNOOZE.equals(action)) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id.hashCode());
            ReminderStore.markDone(ctx, id);
            ReminderStore.add(ctx, System.currentTimeMillis() + 10 * 60_000L, text);
            return;
        }

        ReminderStore.markDone(ctx, id);
        showNotification(ctx, id, text);

        // Live HUD open? Let it speak with full UI feedback.
        if (MainActivity.instance != null) {
            MainActivity.instance.onReminderFired(text);
            return;
        }
        speakInBackground(ctx, text);
    }

    private void showNotification(Context ctx, String id, String text) {
        ReminderStore.ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("reminder_text", text);
        PendingIntent openPi = PendingIntent.getActivity(ctx, id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent snooze = new Intent(ctx, ReminderReceiver.class);
        snooze.setAction(ReminderStore.ACTION_SNOOZE);
        snooze.putExtra("id", id);
        snooze.putExtra("text", text);
        PendingIntent snoozePi = PendingIntent.getBroadcast(ctx, id.hashCode() + 1, snooze,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(ctx, ReminderStore.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_jarvis)
                .setColor(0xFF00F0FF)
                .setContentTitle("⚡ TARS — Recordatorio")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .addAction(new Notification.Action.Builder(null, "Posponer 10 min", snoozePi).build())
                .build();

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(id.hashCode(), n);
    }

    private void speakInBackground(Context ctx, final String text) {
        final PendingResult pending = goAsync();
        final Handler h = new Handler(Looper.getMainLooper());
        final TextToSpeech[] holder = new TextToSpeech[1];
        final Runnable finish = new Runnable() {
            boolean done = false;
            @Override public void run() {
                if (done) return;
                done = true;
                try { if (holder[0] != null) holder[0].shutdown(); } catch (Exception ignored) {}
                try { pending.finish(); } catch (Exception ignored) {}
            }
        };
        h.postDelayed(finish, 9000);
        try {
            holder[0] = new TextToSpeech(ctx.getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override public void onInit(int status) {
                    if (status != TextToSpeech.SUCCESS) { h.post(finish); return; }
                    holder[0].setLanguage(new Locale("es", "MX"));
                    holder[0].setPitch(0.72f);
                    holder[0].setSpeechRate(0.93f);
                    holder[0].setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String u) {}
                        @Override public void onDone(String u) { h.post(finish); }
                        @Override public void onError(String u) { h.post(finish); }
                    });
                    holder[0].speak("Recordatorio: " + text,
                            TextToSpeech.QUEUE_FLUSH, new Bundle(), "jarvis_rem");
                }
            });
        } catch (Exception e) {
            h.post(finish);
        }
    }
}

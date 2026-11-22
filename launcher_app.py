import sys
import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, Gdk

class JarvisApp(Gtk.Window):
    def __init__(self, url="http://127.0.0.1:8000"):
        super().__init__(title="J.E.A.R.V.I.S. // CYBERPUNK 2077 HUD")
        
        self.set_default_size(1440, 920)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.is_fullscreen = False

        # Dark theme styling for window frame
        screen = Gdk.Screen.get_default()
        css_provider = Gtk.CssProvider()
        css_provider.load_from_data(b"""
            window {
                background-color: #05050d;
            }
        """)
        Gtk.StyleContext.add_provider_for_screen(
            screen, css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        # WebKit Settings
        web_context = WebKit2.WebContext.get_default()
        
        # Enable permissions automatically for mic
        def on_permission_request(web_view, req):
            req.allow()
            return True

        self.web_view = WebKit2.WebView.new_with_context(web_context)
        self.web_view.connect("permission-request", on_permission_request)
        
        settings = self.web_view.get_settings()
        settings.set_enable_webgl(True)
        settings.set_enable_media_stream(True)
        settings.set_enable_mediasource(True)
        settings.set_enable_webaudio(True)
        settings.set_enable_developer_extras(True)
        settings.set_enable_smooth_scrolling(True)
        settings.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)

        self.add(self.web_view)
        self.connect("destroy", Gtk.main_quit)
        self.connect("key-press-event", self.on_key_press)

        self.web_view.load_uri(url)

    def on_key_press(self, widget, event):
        # F11 for Fullscreen toggle
        if event.keyval == Gdk.KEY_F11:
            if self.is_fullscreen:
                self.unfullscreen()
                self.is_fullscreen = False
            else:
                self.fullscreen()
                self.is_fullscreen = True
            return True
        # Ctrl+R or F5 for Reload
        elif (event.state & Gdk.ModifierType.CONTROL_MASK and event.keyval in (Gdk.KEY_r, Gdk.KEY_R)) or event.keyval == Gdk.KEY_F5:
            self.web_view.reload()
            return True
        return False

def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
    app = JarvisApp(url)
    app.show_all()
    Gtk.main()

if __name__ == "__main__":
    main()

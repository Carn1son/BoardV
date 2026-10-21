// BoardV for Windows: the BoardV web app in a WebView2 window (the browser built into Windows 10/11).
// Everything ships inside this one exe: the web app (www.zip), the WebView2 libraries and the bridge script.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BoardV
{
    static class Build
    {
        public static readonly Dictionary<string, string> V = Read();
        static Dictionary<string, string> Read()
        {
            var d = new Dictionary<string, string>();
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("build.txt"))
            using (var r = new StreamReader(s, Encoding.UTF8))
                foreach (var line in r.ReadToEnd().Split('\n'))
                {
                    int i = line.IndexOf('='); if (i > 0) d[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
                }
            return d;
        }
        public static string Get(string k, string def) { string v; return V.TryGetValue(k, out v) && v != "" ? v : def; }
        public static string Version { get { return Get("version", "0.0.0"); } }
        public static string AppName { get { return Get("app", "BoardV"); } }          // "BoardV" or "BoardV Lite" while it is tested
        public static string SetupName { get { return Get("setup", "BoardV-Setup.exe"); } }
        public static string PortableName { get { return Get("portable", "BoardV-portable.exe"); } }
    }

    static class Program
    {
        public static string Home;      // %LOCALAPPDATA%\BoardV (data, unpacked app)
        public static string AppDir;    // unpacked www + WebView2Loader.dll for this version
        public static bool Portable;
        static Mutex single;

        [STAThread]
        static void Main(string[] args)
        {
            AppDomain.CurrentDomain.AssemblyResolve += (s, e) => // the WebView2 .NET libraries live inside this exe
            {
                string name = new AssemblyName(e.Name).Name + ".dll";
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                {
                    if (st == null) return null;
                    var b = new byte[st.Length]; st.Read(b, 0, b.Length); return Assembly.Load(b);
                }
            };
            Run(args);
        }

        static void Run(string[] args)
        {
            string pipeName = "BoardV-open-" + Environment.UserName + (Build.AppName == "BoardV" ? "" : "-lite");
            bool first;
            single = new Mutex(true, "Local\\" + pipeName, out first);
            if (!first) { PassToRunning(pipeName, args); return; } // a second launch (double-click on a board) opens it in the running window

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            System.Net.ServicePointManager.SecurityProtocol = System.Net.SecurityProtocolType.Tls12;

            string exe = Assembly.GetExecutingAssembly().Location;
            Portable = !File.Exists(Path.Combine(Path.GetDirectoryName(exe), "installed.flag"));
            Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Build.AppName == "BoardV" ? "BoardV" : "BoardV Lite");
            try { AppDir = Unpack(); }
            catch (Exception e) { MessageBox.Show("Не удалось подготовить BoardV: " + e.Message, "BoardV", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

            string wv = null;
            try { wv = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch { }
            if (string.IsNullOrEmpty(wv))
            {
                if (MessageBox.Show("Для BoardV нужен компонент Microsoft Edge WebView2 (обычно он уже есть в Windows 10 и 11).\n\nОткрыть страницу загрузки?",
                    "BoardV", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                    try { Process.Start("https://go.microsoft.com/fwlink/p/?LinkId=2124703"); } catch { }
                return;
            }
            var form = new MainForm(args.Where(BoardFile).ToList());
            new Thread(() => ListenForOthers(pipeName, form)) { IsBackground = true }.Start();
            Application.Run(form);
            GC.KeepAlive(single);
        }

        public static bool BoardFile(string a)
        {
            try { return File.Exists(a) && System.Text.RegularExpressions.Regex.IsMatch(a, @"\.(pcbdoc|brd|bvr|bdv|cad|cst|kicad_pcb|zip|json|asc)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase); }
            catch { return false; }
        }

        // the web app and the native WebView2 loader are unpacked once per version
        static string Unpack()
        {
            string dir = Path.Combine(Home, "app-" + Build.Version);
            string mark = Path.Combine(dir, ".ok");
            if (File.Exists(mark)) return dir;
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
            Directory.CreateDirectory(dir);
            var asm = Assembly.GetExecutingAssembly();
            using (var z = asm.GetManifestResourceStream("www.zip"))
            using (var zip = new ZipArchive(z, ZipArchiveMode.Read))
                foreach (var en in zip.Entries)
                {
                    if (en.FullName.EndsWith("/")) continue;
                    string to = Path.GetFullPath(Path.Combine(dir, "www", en.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (!to.StartsWith(Path.Combine(dir, "www"), StringComparison.OrdinalIgnoreCase)) continue;
                    Directory.CreateDirectory(Path.GetDirectoryName(to));
                    en.ExtractToFile(to, true);
                }
            using (var st = asm.GetManifestResourceStream("WebView2Loader.dll"))
            using (var f = File.Create(Path.Combine(dir, "WebView2Loader.dll"))) st.CopyTo(f);
            File.WriteAllText(mark, Build.Version);
            // older unpacked versions are no longer needed
            foreach (var old in Directory.GetDirectories(Home, "app-*")) if (!string.Equals(old, dir, StringComparison.OrdinalIgnoreCase)) try { Directory.Delete(old, true); } catch { }
            return dir;
        }

        static void PassToRunning(string pipe, string[] args)
        {
            try
            {
                using (var c = new NamedPipeClientStream(".", pipe, PipeDirection.Out))
                {
                    c.Connect(3000);
                    var b = Encoding.UTF8.GetBytes(string.Join("\n", args.Where(BoardFile).Select(Path.GetFullPath)) + "\n\u0004");
                    c.Write(b, 0, b.Length); c.Flush();
                }
            }
            catch { }
        }

        static void ListenForOthers(string pipe, MainForm form)
        {
            while (true)
            {
                try
                {
                    using (var s = new NamedPipeServerStream(pipe, PipeDirection.In, 1))
                    {
                        s.WaitForConnection();
                        var r = new StreamReader(s, Encoding.UTF8);
                        var files = r.ReadToEnd().Replace("\u0004", "").Split('\n').Where(x => x.Trim() != "").ToList();
                        form.BeginInvoke((Action)(() => form.OpenFromOutside(files)));
                    }
                }
                catch { Thread.Sleep(500); }
            }
        }
    }

    class MainForm : Form
    {
        readonly WebView2 web = new WebView2();
        readonly List<string> pending;
        bool pageReady, quitting;
        public readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        ShareServer share;
        Updater updater;

        public MainForm(List<string> files)
        {
            pending = files;
            Text = "BoardV";
            Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            BackColor = ColorTranslator.FromHtml("#1b1d1c");
            MinimumSize = new Size(900, 600);
            Size = new Size(1440, 900);
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Maximized;
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BackColor;
            Controls.Add(web);
            share = new ShareServer(this);
            updater = new Updater(this);
            Load += async (s, e) => await Init();
            FormClosing += OnClosing;
        }

        async Task Init()
        {
            try
            {
                CoreWebView2Environment.SetLoaderDllFolderPath(Program.AppDir);
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.Home, "WebView2"), new CoreWebView2EnvironmentOptions("--disable-features=msSmartScreenProtection"));
                await web.EnsureCoreWebView2Async(env);
                var cw = web.CoreWebView2;
                cw.Settings.AreDevToolsEnabled = false;
                cw.Settings.AreDefaultContextMenusEnabled = true;     // the page shows its own menus and keeps the system one only in text fields
                cw.Settings.IsStatusBarEnabled = false;
                cw.Settings.IsZoomControlEnabled = false;
                cw.Settings.AreBrowserAcceleratorKeysEnabled = false; // Ctrl+F, F5... belong to BoardV
                cw.Settings.IsPasswordAutosaveEnabled = false;
                cw.Settings.IsGeneralAutofillEnabled = false;
                cw.SetVirtualHostNameToFolderMapping("app.boardv", Path.Combine(Program.AppDir, "www"), CoreWebView2HostResourceAccessKind.Allow);
                string head = "window.BV_WIN = " + Json.Serialize(new Dictionary<string, object> { { "portable", Build.PortableName }, { "version", Build.Version } }) + ";\n";
                using (var st = Assembly.GetExecutingAssembly().GetManifestResourceStream("shim.js"))
                using (var r = new StreamReader(st, Encoding.UTF8)) await cw.AddScriptToExecuteOnDocumentCreatedAsync(head + r.ReadToEnd());
                cw.WebMessageReceived += OnMessage;
                cw.NewWindowRequested += (s, e) => { e.Handled = true; External(e.Uri); };
                cw.NavigationStarting += (s, e) => { if (!e.Uri.StartsWith("https://app.boardv/", StringComparison.OrdinalIgnoreCase)) { e.Cancel = true; External(e.Uri); } };
                cw.DocumentTitleChanged += (s, e) => { Text = string.IsNullOrEmpty(cw.DocumentTitle) || cw.DocumentTitle.StartsWith("app.boardv") ? "BoardV" : cw.DocumentTitle; };
                cw.Navigate("https://app.boardv/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show("WebView2 не запустился: " + ex.Message, "BoardV", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        static void External(string url)
        {
            if (string.IsNullOrEmpty(url) || !(url.StartsWith("http://") || url.StartsWith("https://") || url.StartsWith("mailto:"))) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        public void Post(Dictionary<string, object> m)
        {
            if (InvokeRequired) { BeginInvoke((Action)(() => Post(m))); return; }
            try { if (web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsJson(Json.Serialize(m)); } catch { }
        }
        public void Event(string kind, string type, object data) { Post(new Dictionary<string, object> { { "t", kind }, { "m", new Dictionary<string, object> { { "type", type }, { "data", data } } } }); }
        void Reply(object req, object data, string error)
        {
            var m = new Dictionary<string, object> { { "t", "res" }, { "req", req }, { "data", data } };
            if (error != null) m["error"] = error;
            Post(m);
        }

        async void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            Dictionary<string, object> m;
            try { m = Json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson); } catch { return; }
            string t = m.ContainsKey("t") ? m["t"] as string : null;
            object req = m.ContainsKey("req") ? m["req"] : null;
            switch (t)
            {
                case "ready":
                    pageReady = true; OpenFromOutside(pending); pending.Clear(); break;
                case "share-start":
                    try { Reply(req, await share.Start(Convert.FromBase64String((string)m["b64"])), null); }
                    catch (Exception ex) { Reply(req, null, ex.Message); }
                    break;
                case "share-decide": share.Decide(Convert.ToInt32(m["id"]), Convert.ToBoolean(m["ok"])); break;
                case "share-stop": share.Stop("stopped"); break;
                case "share-reply": share.ReplyScan(Convert.ToInt32(m["rid"]), m.ContainsKey("body") ? (string)m["body"] : ""); break;
                case "upd-check": Reply(req, await updater.Check(), null); break;
                case "upd-download": Reply(req, await updater.Download(), null); break;
                case "upd-install": if (updater.Install()) { quitting = true; share.Stop("quit"); Close(); } break;
            }
        }

        public void OpenFromOutside(List<string> files)
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Maximized;
            Activate();
            if (files == null || files.Count == 0) return;
            if (!pageReady) { pending.AddRange(files); return; }
            var list = new List<object>();
            foreach (var f in files)
                try { list.Add(new Dictionary<string, object> { { "name", Path.GetFileName(f) }, { "b64", Convert.ToBase64String(File.ReadAllBytes(f)) } }); } catch { }
            if (list.Count > 0) Post(new Dictionary<string, object> { { "t", "open-files" }, { "files", list } });
        }

        // a connected phone first hears that BoardV on the PC is closing
        async void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (quitting || !share.Linked) return;
            e.Cancel = true; quitting = true;
            share.Stop("quit");
            await share.WaitClosed(6000);
            Close();
        }
    }
}

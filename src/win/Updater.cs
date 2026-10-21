// Updates from the newest GitHub release, only after the user clicks: the installer is downloaded and run silently,
// it replaces the files and starts BoardV again. A portable copy only learns that there is a newer version.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace BoardV
{
    class Updater
    {
        const string Repo = "Carn1son/BoardV";
        readonly MainForm form;
        string downloaded;
        public Updater(MainForm f) { form = f; }

        static HttpClient Http()
        {
            var h = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true }) { Timeout = TimeSpan.FromMinutes(10) };
            h.DefaultRequestHeaders.UserAgent.ParseAdd("BoardV/" + Build.Version);
            return h;
        }
        static int[] Parse(string v) { var m = Regex.Match(v ?? "", @"(\d+)\.(\d+)\.(\d+)"); return m.Success ? new[] { int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value) } : new[] { 0, 0, 0 }; }
        static bool Newer(string a, string b) { var x = Parse(a); var y = Parse(b); for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] > y[i]; return false; }

        public async Task<object> Check()
        {
            if (Program.Portable) return new Dictionary<string, object> { { "mode", "portable" }, { "version", Build.Version } };
            try
            {
                using (var h = Http())
                {
                    var json = await h.GetStringAsync("https://api.github.com/repos/" + Repo + "/releases/latest");
                    var tag = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"v?([^\"]+)\"").Groups[1].Value;
                    if (Newer(tag, Build.Version)) form.Event("upd", "available", new Dictionary<string, object> { { "version", tag } });
                    else form.Event("upd", "none", null);
                    return new Dictionary<string, object> { { "mode", "installer" }, { "version", Build.Version }, { "latest", tag } };
                }
            }
            catch (Exception e) { return new Dictionary<string, object> { { "mode", "installer" }, { "version", Build.Version }, { "error", e.Message } }; }
        }

        public async Task<bool> Download()
        {
            try
            {
                string to = Path.Combine(Path.GetTempPath(), Build.SetupName);
                using (var h = Http())
                using (var r = await h.GetAsync("https://github.com/" + Repo + "/releases/latest/download/" + Build.SetupName, HttpCompletionOption.ResponseHeadersRead))
                {
                    r.EnsureSuccessStatusCode();
                    long total = r.Content.Headers.ContentLength ?? 0, got = 0; int last = -1;
                    using (var src = await r.Content.ReadAsStreamAsync())
                    using (var dst = File.Create(to))
                    {
                        var buf = new byte[81920]; int n;
                        while ((n = await src.ReadAsync(buf, 0, buf.Length)) > 0)
                        {
                            await dst.WriteAsync(buf, 0, n); got += n;
                            int pct = total > 0 ? (int)(got * 100 / total) : 0;
                            if (pct != last) { last = pct; form.Event("upd", "progress", pct); }
                        }
                    }
                }
                downloaded = to;
                form.Event("upd", "downloaded", null);
                return true;
            }
            catch (Exception e) { form.Event("upd", "error", e.Message); return false; }
        }

        public bool Install()
        {
            if (downloaded == null || !File.Exists(downloaded)) return false;
            try { Process.Start(new ProcessStartInfo(downloaded, "/S /R") { UseShellExecute = true }); return true; } // /R: start BoardV again afterwards
            catch (Exception e) { form.Event("upd", "error", e.Message); return false; }
        }
    }
}

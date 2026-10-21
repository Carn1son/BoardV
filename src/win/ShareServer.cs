// The phone link (scanner / board for the phone), as in the Electron build: a one-time HTTP endpoint on the local network.
// The page encrypts everything; this side only passes bytes and asks the user before anything goes out.
//   GET  /bv/<token>/hello      -> 202 {id}; the PC asks the user
//   GET  /bv/<token>/data?id=N  -> 204 undecided, 403 declined, 200 the encrypted blob (once)
//   GET  /bv/<token>/ping|bye   -> keeps / ends the link;  POST /bv/<token>/scan -> the page answers (encrypted) within 4 s
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace BoardV
{
    class ShareServer
    {
        class Req { public string Ip; public bool? Ok; }
        class Session
        {
            public TcpListener Listener; public string Token; public byte[] Blob;
            public Dictionary<int, Req> Reqs = new Dictionary<int, Req>();
            public int Bad, Seq, Rseq, LinkId; public bool Sent, Lost, Closing, Closed; public string LinkIp; public DateTime Seen;
            public Timer Timer, Watch, CloseTimer;
            public Dictionary<int, TaskCompletionSource<string>> Pend = new Dictionary<int, TaskCompletionSource<string>>();
        }
        readonly MainForm form;
        readonly object gate = new object();
        Session s, closing;

        public ShareServer(MainForm f) { form = f; }
        public bool Linked { get { lock (gate) return s != null && s.Sent; } }

        void Send(string type, object data) { form.Event("share", type, data); }

        static List<string> LanIPs()
        {
            var o = new List<string>();
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var a in ni.GetIPProperties().UnicastAddresses)
                    if (a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address)) o.Add(a.Address.ToString());
            }
            return o.Distinct().ToList();
        }

        public Task<Dictionary<string, object>> Start(byte[] blob)
        {
            Stop("restart");
            var x = new Session { Blob = blob };
            var tok = new byte[16]; using (var r = RandomNumberGenerator.Create()) r.GetBytes(tok);
            x.Token = BitConverter.ToString(tok).Replace("-", "").ToLowerInvariant();
            x.Listener = new TcpListener(IPAddress.Any, 0);
            x.Listener.Start();
            lock (gate) s = x;
            x.Timer = new Timer(_ => Stop("timeout", x), null, 10 * 60 * 1000, Timeout.Infinite);
            Task.Run(() => AcceptLoop(x));
            int port = ((IPEndPoint)x.Listener.LocalEndpoint).Port;
            return Task.FromResult(new Dictionary<string, object> { { "port", port }, { "ips", LanIPs() }, { "token", x.Token } });
        }

        public void Decide(int id, bool ok) { lock (gate) { Req r; if (s != null && s.Reqs.TryGetValue(id, out r) && r.Ok == null) r.Ok = ok; } }

        public void ReplyScan(int rid, string body)
        {
            TaskCompletionSource<string> t = null;
            lock (gate) { if (s != null && s.Pend.TryGetValue(rid, out t)) s.Pend.Remove(rid); }
            if (t != null) t.TrySetResult(body.Length > 8192 ? body.Substring(0, 8192) : body);
        }

        public void Stop(string reason) { Session x; lock (gate) x = s; if (x != null) Stop(reason, x); }

        void Stop(string reason, Session x)
        {
            lock (gate)
            {
                if (s != x) return;
                s = null;
                if (x.Timer != null) x.Timer.Dispose(); if (x.Watch != null) x.Watch.Dispose();
                foreach (var p in x.Pend.Values) p.TrySetResult(null);
                x.Pend.Clear();
                bool phoneEnded = reason == "bye" || reason == "lost" || reason == "idle";
                if (x.Sent && !phoneEnded) // the PC hung up: answer the phone's next ping with 410, then close
                {
                    x.Closing = true; closing = x;
                    x.CloseTimer = new Timer(_ => Finish(x), null, 12000, Timeout.Infinite);
                }
                else try { x.Listener.Stop(); } catch { }
            }
            Send("ended", reason ?? "");
        }

        void Finish(Session x)
        {
            lock (gate) { if (x.Closed) return; x.Closed = true; if (closing == x) closing = null; }
            try { x.Listener.Stop(); } catch { }
            if (x.CloseTimer != null) x.CloseTimer.Dispose();
        }

        public async Task WaitClosed(int ms)
        {
            Session x; lock (gate) x = closing;
            var t0 = DateTime.Now;
            while (x != null && !x.Closed && (DateTime.Now - t0).TotalMilliseconds < ms) await Task.Delay(100);
            if (x != null) Finish(x);
        }

        async Task AcceptLoop(Session x)
        {
            while (true)
            {
                TcpClient c;
                try { c = await x.Listener.AcceptTcpClientAsync(); } catch { return; }
                var _ = Task.Run(() => Handle(x, c));
            }
        }

        async Task Handle(Session x, TcpClient c)
        {
            using (c)
            {
                try
                {
                    c.ReceiveTimeout = 10000; c.SendTimeout = 10000;
                    var ns = c.GetStream();
                    var head = new MemoryStream(); var buf = new byte[1];
                    int match = 0;
                    while (head.Length < 8192) // read the request head byte by byte up to the blank line
                    {
                        int n = await ns.ReadAsync(buf, 0, 1); if (n <= 0) return;
                        head.WriteByte(buf[0]);
                        match = (buf[0] == (match % 2 == 0 ? 13 : 10)) ? match + 1 : (buf[0] == 13 ? 1 : 0);
                        if (match == 4) break;
                    }
                    var lines = Encoding.ASCII.GetString(head.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var first = lines[0].Split(' '); if (first.Length < 2) return;
                    string method = first[0], target = first[1];
                    int clen = 0;
                    foreach (var l in lines.Skip(1)) { int i = l.IndexOf(':'); if (i > 0 && l.Substring(0, i).Trim().Equals("Content-Length", StringComparison.OrdinalIgnoreCase)) int.TryParse(l.Substring(i + 1).Trim(), out clen); }
                    string body = "";
                    if (clen > 16384) { await Respond(ns, 413, null, null); return; }
                    if (clen > 0) { var b = new byte[clen]; int got = 0; while (got < clen) { int n = await ns.ReadAsync(b, got, clen - got); if (n <= 0) break; got += n; } body = Encoding.UTF8.GetString(b, 0, got); }
                    var ep = (IPEndPoint)c.Client.RemoteEndPoint;
                    string ip = (ep.Address.IsIPv4MappedToIPv6 ? ep.Address.MapToIPv4() : ep.Address).ToString();
                    string path = target, query = "";
                    int q = target.IndexOf('?'); if (q >= 0) { path = target.Substring(0, q); query = target.Substring(q + 1); }
                    int qid = -1; foreach (var kv in query.Split('&')) { var p = kv.Split('='); if (p.Length == 2 && p[0] == "id") int.TryParse(p[1], out qid); }
                    await Route(x, ns, method, path, qid, ip, body);
                }
                catch { }
            }
        }

        static async Task Respond(Stream ns, int code, string type, byte[] body)
        {
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(code == 200 ? "OK" : code == 202 ? "Accepted" : code == 204 ? "No Content" : "Status").Append("\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nCache-Control: no-store\r\nConnection: close\r\n");
            if (type != null) sb.Append("Content-Type: ").Append(type).Append("\r\n");
            sb.Append("Content-Length: ").Append(body == null ? 0 : body.Length).Append("\r\n\r\n");
            var h = Encoding.ASCII.GetBytes(sb.ToString());
            await ns.WriteAsync(h, 0, h.Length);
            if (body != null && body.Length > 0) await ns.WriteAsync(body, 0, body.Length);
            await ns.FlushAsync();
        }

        async Task Route(Session x, Stream ns, string method, string path, int qid, string ip, string body)
        {
            if (method == "OPTIONS") { await Respond(ns, 204, null, null); return; }
            string bas = "/bv/" + x.Token;
            bool closingNow; lock (gate) closingNow = x.Closing;
            if (closingNow) // tell the phone it was disconnected by this PC
            {
                await Respond(ns, 410, null, null);
                if (ip == x.LinkIp) { var _ = Task.Delay(300).ContinueWith(t => Finish(x)); }
                return;
            }
            bool current; lock (gate) current = s == x;
            if (!current || (method != "GET" && method != "POST") || !path.StartsWith(bas + "/"))
            {
                int bad; lock (gate) bad = ++x.Bad;
                await Respond(ns, 404, null, null);
                if (bad > 30) Stop("too many wrong requests", x);
                return;
            }
            if (x.Sent) // after the board went over, only that phone may talk
            {
                bool mine = ip == x.LinkIp && qid == x.LinkId;
                if (mine && path == bas + "/ping") { Touch(x); await Respond(ns, 204, null, null); return; }
                if (mine && path == bas + "/bye") { await Respond(ns, 204, null, null); Stop("bye", x); return; }
                if (mine && method == "POST" && path == bas + "/scan")
                {
                    Touch(x);
                    if (x.Timer != null) x.Timer.Change(12 * 3600 * 1000, Timeout.Infinite);
                    var tcs = new TaskCompletionSource<string>(); int rid;
                    lock (gate) { rid = ++x.Rseq; x.Pend[rid] = tcs; }
                    Send("scan", new Dictionary<string, object> { { "rid", rid }, { "body", body } });
                    var done = await Task.WhenAny(tcs.Task, Task.Delay(4000));
                    lock (gate) x.Pend.Remove(rid);
                    string ans = done == tcs.Task ? tcs.Task.Result : null;
                    if (ans == null) await Respond(ns, 204, null, null); else await Respond(ns, 200, "text/plain", Encoding.UTF8.GetBytes(ans));
                    return;
                }
                await Respond(ns, 410, null, null); return;
            }
            if (method != "GET") { await Respond(ns, 404, null, null); return; }
            if (path == bas + "/hello")
            {
                int id = 0; bool isNew = false;
                lock (gate)
                {
                    foreach (var kv in x.Reqs) if (kv.Value.Ip == ip && kv.Value.Ok == null) id = kv.Key; // the same phone asking again
                    if (id == 0) { id = ++x.Seq; x.Reqs[id] = new Req { Ip = ip }; isNew = true; }
                }
                if (isNew) Send("request", new Dictionary<string, object> { { "id", id }, { "ip", ip } });
                await Respond(ns, 202, "application/json", Encoding.UTF8.GetBytes("{\"id\":" + id + "}"));
                return;
            }
            if (path == bas + "/data")
            {
                Req r; byte[] blob = null;
                lock (gate)
                {
                    if (!x.Reqs.TryGetValue(qid, out r) || r.Ip != ip) r = null;
                    else if (r.Ok == true && !x.Sent) { x.Sent = true; x.LinkIp = ip; x.LinkId = qid; blob = x.Blob; x.Blob = null; }
                }
                if (r == null) { await Respond(ns, 404, null, null); return; }
                if (r.Ok == null) { await Respond(ns, 204, null, null); return; }
                if (r.Ok == false || blob == null) { await Respond(ns, 403, null, null); return; }
                await Respond(ns, 200, "application/octet-stream", blob);
                Send("sent", new Dictionary<string, object> { { "ip", ip } });
                // the board goes once; the link stays only for scans from this phone, until one side disconnects
                if (x.Timer != null) x.Timer.Change(12 * 3600 * 1000, Timeout.Infinite);
                lock (gate) { x.Seen = DateTime.Now; x.Lost = false; }
                x.Watch = new Timer(_ => { bool gone; lock (gate) gone = s == x && (DateTime.Now - x.Seen).TotalSeconds > 15; if (gone) Stop("lost", x); }, null, 2000, 2000);
                return;
            }
            await Respond(ns, 404, null, null);
        }

        void Touch(Session x)
        {
            bool back;
            lock (gate) { x.Seen = DateTime.Now; back = x.Lost; x.Lost = false; }
            if (back) Send("back", "");
        }
    }
}

/**
 * [INPUT]: 依赖 Tauri 应用资源与用户目录、内置 Node launcher 的带官方启动凭证就绪协议
 * [OUTPUT]: 提供 HarnessProcess 状态与有界启动/退出，进程 stdin 随窗口宿主崩溃自动关闭
 * [POS]: Pake 的最小本地服务适配，不向网页暴露执行任意命令的接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Manager, Url};

pub struct HarnessProcess {
    pub url: String,
    child: Mutex<Child>,
}

impl HarnessProcess {
    pub fn start(app: &tauri::App) -> Result<Self, Box<dyn std::error::Error>> {
        let runtime = app.path().resource_dir()?.join("runtime");
        let home = match std::env::var_os("OWNDSH_DESKTOP_HOME") {
            Some(path) => std::path::PathBuf::from(path),
            None => app.path().app_data_dir()?.join("Harness"),
        };
        std::fs::create_dir_all(&home)?;
        let mut child = Command::new(runtime.join("bin/node"))
            .arg(runtime.join("launcher.mjs"))
            .env("DSH_HOME", &home)
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        let stdout = child.stdout.take().ok_or("missing launcher stdout")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if let Some(value) = line.strip_prefix("OWNDSH_READY ") {
                    let _ = sender.send(value.to_string());
                }
            }
        });
        let mut state = Self { url: String::new(), child: Mutex::new(child) };
        let url = receiver.recv_timeout(Duration::from_secs(90))
            .map_err(|error| format!("Harness startup failed: {error}. Log: {}", home.join("desktop.log").display()))?;
        let parsed = Url::parse(&url)?;
        let query: Vec<_> = parsed.query_pairs().collect();
        if parsed.scheme() != "http" || parsed.host_str() != Some("127.0.0.1")
            || parsed.port().is_none() || parsed.path() != "/" || !parsed.username().is_empty()
            || parsed.password().is_some() || parsed.fragment().is_some()
            || query.len() != 1 || query[0].0 != "token" || query[0].1.len() != 43
            || !query[0].1.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        {
            return Err("Harness returned an invalid loopback URL".into());
        }
        state.url = url;
        Ok(state)
    }

    pub fn stop(&self) {
        let Ok(mut child) = self.child.lock() else { return };
        drop(child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(9);
        loop {
            match child.try_wait() {
                Ok(Some(_)) | Err(_) => break,
                Ok(None) if Instant::now() >= deadline => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            }
        }
    }
}

impl Drop for HarnessProcess {
    fn drop(&mut self) { self.stop(); }
}

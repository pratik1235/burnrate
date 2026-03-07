#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct ServerChild(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(ServerChild(Mutex::new(None)))
        .setup(|app| {
            let sidecar = app
                .shell()
                .sidecar("burnrate-server")
                .expect("failed to find burnrate-server sidecar");

            let (mut rx, child) = sidecar.spawn().expect("failed to spawn sidecar");

            app.state::<ServerChild>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let s = String::from_utf8_lossy(&line);
                            println!("SIDECAR STDOUT: {}", s);
                            if s.contains("Application startup complete") {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.eval("window.location.reload()");
                                }
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let s = String::from_utf8_lossy(&line);
                            println!("SIDECAR STDERR: {}", s);
                            if s.contains("Application startup complete") {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let _ = window.eval("window.location.reload()");
                                }
                            }
                        }
                        CommandEvent::Terminated(payload) => {
                            println!("SIDECAR TERMINATED: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() != "main" {
                    return;
                }
                if let Some(child) = window
                    .app_handle()
                    .state::<ServerChild>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running burnrate");
}

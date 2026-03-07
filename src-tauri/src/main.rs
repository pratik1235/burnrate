#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::thread;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use notify::{Watcher, RecursiveMode, recommended_watcher, Event};

/// State: currently watched folder path (None = not watching)
struct WatchState {
    path: Mutex<Option<PathBuf>>,
    /// Holds the watcher so it stays alive
    _watcher: Mutex<Option<Box<dyn notify::Watcher + Send>>>,
}

/// Called from the frontend to open a native folder picker and start watching.
#[tauri::command]
async fn pick_and_watch_folder(
    app: AppHandle,
    state: tauri::State<'_, Arc<WatchState>>,
) -> Result<String, String> {
    // Open native folder-picker dialog
    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    let folder_path = match folder {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Err("cancelled".to_string()),
    };

    let path_str = folder_path.to_string_lossy().to_string();

    // Store the path
    *state.path.lock().unwrap() = Some(folder_path.clone());

    // Set up the file watcher
    let app_handle = app.clone();
    let folder_clone = folder_path.clone();

    let watcher_result = recommended_watcher(move |res: Result<Event, _>| {
        if let Ok(event) = res {
            use notify::EventKind;
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    for path in &event.paths {
                        if let Some(ext) = path.extension() {
                            if ext.eq_ignore_ascii_case("pdf") {
                                let path_str = path.to_string_lossy().to_string();
                                let _ = app_handle.emit("watch-folder-new-pdf", path_str);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    });

    match watcher_result {
        Ok(mut watcher) => {
            watcher
                .watch(&folder_clone, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
            // Keep watcher alive in state
            *state._watcher.lock().unwrap() = Some(Box::new(watcher));
            Ok(path_str)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Returns the currently watched folder path (or null).
#[tauri::command]
fn get_watched_folder(state: tauri::State<'_, Arc<WatchState>>) -> Option<String> {
    state
        .path
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

/// Stop watching (clear watcher + path).
#[tauri::command]
fn stop_watching(state: tauri::State<'_, Arc<WatchState>>) {
    *state._watcher.lock().unwrap() = None;
    *state.path.lock().unwrap() = None;
}

fn main() {
    let watch_state = Arc::new(WatchState {
        path: Mutex::new(None),
        _watcher: Mutex::new(None),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(watch_state)
        .invoke_handler(tauri::generate_handler![
            pick_and_watch_folder,
            get_watched_folder,
            stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running burnrate");
}

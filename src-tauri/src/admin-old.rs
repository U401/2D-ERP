use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;

#[derive(Debug, Serialize, Deserialize)]
struct CreateUserRequest {
    username: String,
    password: String,
    role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpdateUsernameRequest {
    user_id: String,
    new_username: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteUserRequest {
    user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ResetPasswordRequest {
    user_id: String,
    new_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpdateRoleRequest {
    user_id: String,
    new_role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SupabaseUser {
    id: String,
    username: String,
    role: String,
    email: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

fn get_supabase_url() -> String {
    env::var("NEXT_PUBLIC_SUPABASE_URL")
        .expect("NEXT_PUBLIC_SUPABASE_URL not set")
}

fn get_service_role_key() -> String {
    env::var("SUPABASE_SERVICE_ROLE_KEY")
        .expect("SUPABASE_SERVICE_ROLE_KEY not set")
}

// Tauri command to create a new user
#[tauri::command]
pub async fn create_user(username: String, password: String, role: String) -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    // Validate username
    if username.len() < 3 || username.len() > 50 {
        return Err("Invalid username. Must be 3-50 characters.".to_string());
    }

    if !username.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Username can only contain letters, numbers, hyphens, and underscores.".to_string());
    }

    // Validate password
    if password.len() < 6 {
        return Err("Password must be at least 6 characters.".to_string());
    }

    // Normalize role
    let safe_role = if role.to_lowercase() == "admin" {
        "admin".to_string()
    } else {
        "user".to_string()
    };

    let email = format!("{}@erp.local", username);

    // Create auth user
    let client = reqwest::Client::new();
    let auth_url = format!("{}/auth/v1/admin/users", supabase_url);

    let auth_payload = json!({
        "email": email,
        "password": password,
        "email_confirm": true,
        "user_metadata": {
            "username": username,
            "role": safe_role
        }
    });

    let auth_response = client
        .post(&auth_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&auth_payload)
        .send()
        .await;

    let auth_response = match auth_response {
        Ok(resp) => resp,
        Err(e) => return Err(format!("Failed to create user: {}", e)),
    };

    if auth_response.status().is_success() {
        let user_data: serde_json::Value = match auth_response.json().await {
            Ok(data) => data,
            Err(e) => return Err(format!("Failed to parse response: {}", e)),
        };

        let user_id = user_data["user"]["id"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Create store for user
        let store_url = format!("{}/rest/v1/stores", supabase_url);
        let store_payload = json!({
            "owner_user_id": user_id,
            "name": format!("Store - {}", username)
        });

        let store_response = client
            .post(&store_url)
            .header("apikey", &service_key)
            .header("Authorization", &format!("Bearer {}", service_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&store_payload)
            .send()
            .await;

        let store_id = match store_response {
            Ok(resp) if resp.status().is_success() => {
                let store_data: serde_json::Value = match resp.json().await {
                    Ok(data) => data,
                    Err(_) => serde_json::Value::Null,
                };
                store_data[0]["id"].as_str().unwrap_or("").to_string()
            },
            _ => String::new(),
        };

        // Create profile
        let profile_url = format!("{}/rest/v1/profiles", supabase_url);
        let profile_payload = json!({
            "id": user_id,
            "username": username,
            "role": safe_role,
            "store_id": store_id
        });

        let _profile_response = client
            .post(&profile_url)
            .header("apikey", &service_key)
            .header("Authorization", &format!("Bearer {}", service_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&profile_payload)
            .send()
            .await;

        return Ok(json!({
            "success": true,
            "message": format!("User '{}' created successfully", username),
            "user": { "id": user_id, "username": username, "role": safe_role }
        }).to_string());
    }

    // Handle duplicate user
    if auth_response.status() == 409 {
        return Err(format!("User '{}' already exists", username));
    }

    // Other errors
    let error_text = match auth_response.text().await {
        Ok(text) => text,
        Err(_) => "Unknown error".to_string(),
    };

    Err(format!("Failed to create user: {}", error_text))
}

// Tauri command to update username
#[tauri::command]
pub async fn update_username(user_id: String, new_username: String) -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    // Validate username
    if new_username.len() < 3 || new_username.len() > 50 {
        return Err("Invalid username. Must be 3-50 characters.".to_string());
    }

    if !new_username.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Username can only contain letters, numbers, hyphens, and underscores.".to_string());
    }

    let client = reqwest::Client::new();

    // Get current username for logging
    let profile_url = format!("{}/rest/v1/profiles?id=eq.{}&select=username", supabase_url, user_id);
    let profile_response = client
        .get(&profile_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    let old_username = match profile_response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => serde_json::Value::Null,
            };
            data[0]["username"].as_str().unwrap_or("unknown").to_string()
        },
        _ => "unknown".to_string(),
    };

    // Update auth user
    let new_email = format!("{}@erp.local", new_username);
    let auth_url = format!("{}/auth/v1/admin/users/{}", supabase_url, user_id);
    let auth_payload = json!({
        "email": new_email,
        "user_metadata": { "username": new_username }
    });

    let auth_response = client
        .patch(&auth_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&auth_payload)
        .send()
        .await;

    if auth_response.is_err() || !auth_response.as_ref().unwrap().status().is_success() {
        return Err("Failed to update user in auth".to_string());
    }

    // Update profile
    let profile_update_url = format!("{}/rest/v1/profiles?id=eq.{}", supabase_url, user_id);
    let _profile_payload = json!({ "username": new_username });

    let profile_update_response = client
        .patch(&profile_update_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .send()
        .await;

    if profile_update_response.is_err() || !profile_update_response.as_ref().unwrap().status().is_success() {
        return Err("Failed to update profile".to_string());
    }

    Ok(json!({
        "success": true,
        "message": format!("Username updated from '{}' to '{}'", old_username, new_username)
    }).to_string())
}

// Tauri command to delete user
#[tauri::command]
pub async fn delete_user(user_id: String) -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    if user_id.is_empty() {
        return Err("Missing user ID".to_string());
    }

    let client = reqwest::Client::new();

    // Check if user is admin and count admins
    let profile_url = format!("{}/rest/v1/profiles?id=eq.{}&select=role,username", supabase_url, user_id);
    let profile_response = client
        .get(&profile_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    let (is_admin, username) = match profile_response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => serde_json::Value::Null,
            };
            let role = data[0]["role"].as_str().unwrap_or("user");
            let user = data[0]["username"].as_str().unwrap_or("unknown");
            (role == "admin", user.to_string())
        },
        _ => (false, "unknown".to_string()),
    };

    if is_admin {
        // Count admins
        let admin_count_url = format!("{}/rest/v1/profiles?role=eq.admin&select=id", supabase_url);
        let admin_count_response = client
            .get(&admin_count_url)
            .header("apikey", &service_key)
            .header("Authorization", &format!("Bearer {}", service_key))
            .header("Prefer", "count=exact")
            .send()
            .await;

        let admin_count: i32 = match admin_count_response {
            Ok(resp) => {
                let count_header = resp.headers().get("Content-Range").unwrap_or("0".to_string());
                count_header.split('/').last().unwrap_or("0").parse().unwrap_or(1)
            },
            Err(_) => 1,
        };

        if admin_count <= 1 {
            return Err("Cannot delete the last admin account".to_string());
        }
    }

    // Get store info
    let store_url = format!("{}/rest/v1/stores?owner_user_id=eq.{}&select=id,name", supabase_url, user_id);
    let store_response = client
        .get(&store_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    let store_name = match store_response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => serde_json::Value::Null,
            };
            if data.is_array() && data.as_array().unwrap().len() > 0 {
                data[0]["name"].as_str().unwrap_or("").to_string()
            } else {
                String::new()
            }
        },
        _ => String::new(),
    };

    // Delete store first (cascades)
    let delete_store_url = format!("{}/rest/v1/stores?owner_user_id=eq.{}", supabase_url, user_id);
    let _delete_store = client
        .delete(&delete_store_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    // Nullify sessions and activity logs
    let sessions_url = format!("{}/rest/v1/sessions?user_id=eq.{}", supabase_url, user_id);
    let nullify_sessions = json!({ "user_id": null });
    let _sessions_update = client
        .patch(&sessions_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&nullify_sessions)
        .send()
        .await;

    let logs_url = format!("{}/rest/v1/activity_logs?user_id=eq.{}", supabase_url, user_id);
    let nullify_logs = json!({ "user_id": null });
    let _logs_update = client
        .patch(&logs_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&nullify_logs)
        .send()
        .await;

    // Delete profile
    let delete_profile_url = format!("{}/rest/v1/profiles?id=eq.{}", supabase_url, user_id);
    let _delete_profile = client
        .delete(&delete_profile_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    // Delete auth user
    let auth_delete_url = format!("{}/auth/v1/admin/users/{}", supabase_url, user_id);
    let _auth_delete_response = client
        .delete(&auth_delete_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    Ok(json!({
        "success": true,
        "message": format!("User '{}' deleted successfully", username)
    }).to_string())
}

// Tauri command to reset password
#[tauri::command]
pub async fn reset_password(user_id: String, new_password: String) -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    if new_password.len() < 6 {
        return Err("Password must be at least 6 characters".to_string());
    }

    let client = reqwest::Client::new();

    // Get username for response
    let profile_url = format!("{}/rest/v1/profiles?id=eq.{}&select=username", supabase_url, user_id);
    let profile_response = client
        .get(&profile_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    let username = match profile_response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => serde_json::Value::Null,
            };
            data[0]["username"].as_str().unwrap_or("unknown").to_string()
        },
        _ => "unknown".to_string(),
    };

    // Update password via auth API
    let auth_url = format!("{}/auth/v1/admin/users/{}", supabase_url, user_id);
    let auth_payload = json!({ "password": new_password });

    let auth_response = client
        .patch(&auth_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&auth_payload)
        .send()
        .await;

    if auth_response.is_err() || !auth_response.as_ref().unwrap().status().is_success() {
        return Err("Failed to reset password".to_string());
    }

    Ok(json!({
        "success": true,
        "message": format!("Password reset for user '{}'", username)
    }).to_string())
}

// Tauri command to update role
#[tauri::command]
pub async fn update_role(user_id: String, new_role: String) -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    if new_role != "admin" && new_role != "user" {
        return Err("Invalid role. Must be 'admin' or 'user'".to_string());
    }

    let client = reqwest::Client::new();

    // Get current info
    let profile_url = format!("{}/rest/v1/profiles?id=eq.{}&select=username,role", supabase_url, user_id);
    let profile_response = client
        .get(&profile_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    let (username, old_role) = match profile_response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(_) => serde_json::Value::Null,
            };
            let user = data[0]["username"].as_str().unwrap_or("unknown");
            let role = data[0]["role"].as_str().unwrap_or("user");
            (user.to_string(), role.to_string())
        },
        _ => ("unknown".to_string(), "user".to_string()),
    };

    // Prevent removing last admin
    if old_role == "admin" && new_role == "user" {
        // Count admins
        let admin_count_url = format!("{}/rest/v1/profiles?role=eq.admin&select=id", supabase_url);
        let admin_count_response = client
            .get(&admin_count_url)
            .header("apikey", &service_key)
            .header("Authorization", &format!("Bearer {}", service_key))
            .header("Prefer", "count=exact")
            .send()
            .await;

        let admin_count: i32 = match admin_count_response {
            Ok(resp) => {
                let count_header = resp.headers().get("Content-Range").unwrap_or("0".to_string());
                count_header.split('/').last().unwrap_or("0").parse().unwrap_or(1)
            },
            Err(_) => 1,
        };

        if admin_count <= 1 {
            return Err("Cannot demote the last admin account".to_string());
        }
    }

    // Update role in profile
    let update_url = format!("{}/rest/v1/profiles?id=eq.{}", supabase_url, user_id);
    let payload = json!({ "role": new_role });

    let update_response = client
        .patch(&update_url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    if update_response.is_err() || !update_response.as_ref().unwrap().status().is_success() {
        return Err("Failed to update role".to_string());
    }

    Ok(json!({
        "success": true,
        "message": format!("Role changed from '{}' to '{}' for '{}'", old_role, new_role, username)
    }).to_string())
}

// Tauri command to list all users
#[tauri::command]
pub async fn list_users() -> Result<String, String> {
    let supabase_url = get_supabase_url();
    let service_key = get_service_role_key();

    let client = reqwest::Client::new();

    let url = format!("{}/rest/v1/profiles?select=id,username,role,store_id,stores(name,created_at)&order=username", supabase_url);

    let response = client
        .get(&url)
        .header("apikey", &service_key)
        .header("Authorization", &format!("Bearer {}", service_key))
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = match resp.json().await {
                Ok(d) => d,
                Err(e) => return Err(format!("Failed to parse response: {}", e)),
            };
            Ok(json!({
                "success": true,
                "users": data
            }).to_string())
        },
        Ok(resp) => {
            let error_text = match resp.text().await {
                Ok(text) => text,
                Err(_) => "Unknown error".to_string(),
            };
            Err(format!("Failed to fetch users: {}", error_text))
        }
        Err(e) => Err(format!("Failed to make request: {}", e)),
    }
}


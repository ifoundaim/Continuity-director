export type Vector2 = [number, number];
export type Vector3 = [number, number, number];

export interface SceneObject {
  id: string;
  type: string;
  wall?: "left" | "right" | "front" | "rear";
  pos?: Vector2;
  size?: [number, number];
  height_ft?: number;
  diag_in?: number;
  center_ft?: Vector2;
  centers_ft?: Vector2[];
  span_ft?: number;
  mullion_spacing_ft?: number;
  yc_decal_in?: number;
  door_at_ft_from_front?: number;
  count?: number;
  spacing_ft?: number;
  seat_h_in?: number;
}

export interface SceneGraph {
  scene_id: string;
  units: "ft" | "m";
  room: { width: number; depth: number; height: number };
  lighting: { key: string; color_temp_k: number; window_side?: string };
  objects: SceneObject[];
  scale_anchors: {
    aim_height_cm: number;   // 170
    em_height_cm: number;    // 160.02
    codex_to_aim_ratio?: number;
    table_h_ft: number;
    chair_seat_h_ft: number;
  };
  default_camera: { fov_deg: number; pos: Vector3; look_at: Vector3 };
}

export interface CharacterProfile {
  id: string;
  name: string;
  height_cm: number;
  description: string;
  images_base64: string[]; // data URLs
}

export interface SettingProfile {
  description: string;      // extra setting notes users want enforced
  images_base64: string[];  // floor plan / elevation / grid / mood refs
}


from ultralytics import YOLO
import cv2
import supervision as sv
from pathlib import Path

# ========== CONFIGURATION - EDIT THESE ==========
VIDEO_PATH = r"C:\Users\brundern\Desktop\CapstoneI\model_src\road-anomaly-detection\driving.mp4"  # ← PUT YOUR VIDEO PATH HERE
MODEL_PATH = "YOLOv8_Small_2nd_Model.pt"  # Using Model 2 (faster)
# MODEL_PATH = "RoadDetectionModel/RoadModel_yolov8m.pt_rounds120_b9/weights/best.pt"  # Or use Model 1 (better accuracy)
CONFIDENCE_THRESHOLD = 0.35
OUTPUT_FOLDER = "video_output"
SHOW_LIVE_PREVIEW = True  # Set to True to watch processing in real-time, False for faster headless processing
# ================================================

def process_video_with_detection(video_path: str, model_path: str, conf: float, output_dir: str, show_preview: bool = False):
    """Process a video file and annotate it with road anomaly detections."""
    
    # Setup paths
    video_path = Path(video_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if video exists
    if not video_path.is_file():
        print(f"❌ Error: Video file not found at: {video_path}")
        print(f"Please update VIDEO_PATH in the script to point to your video file.")
        return
    
    # Load the model
    print(f"🔄 Loading model from: {model_path}")
    try:
        model = YOLO(model_path)
        class_names = model.names
        print(f"✅ Model loaded successfully!")
        print(f"📋 Detectable classes: {list(class_names.values())}\n")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return
    
    # Setup annotators (for drawing boxes and labels)
    box_annotator = sv.BoxAnnotator(thickness=2, color=sv.Color.RED)
    label_annotator = sv.LabelAnnotator(
        text_thickness=1,
        text_scale=0.5,
        text_color=sv.Color.BLACK,
        text_padding=3
    )
    
    output_path = output_dir / f"{video_path.stem}_annotated.mp4"
    print(f"🎬 Processing video: {video_path.name}")
    print(f"💾 Output will be saved to: {output_path}")
    
    if show_preview:
        print(f"👁️  Live preview enabled - Press 'q' to stop processing\n")
    else:
        print(f"⚡ Headless mode - Processing without preview\n")
    
    # Open video capture
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"❌ Error: Could not open video file")
        return
    
    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Setup video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
    
    if not writer.isOpened():
        print(f"❌ Error: Could not create output video file")
        cap.release()
        return
    
    frame_idx = 0
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Run YOLO detection
            results = model.predict(frame, conf=conf, verbose=False)[0]
            detections = sv.Detections.from_ultralytics(results)
            
            # Create labels for each detection
            labels = [
                f"{class_names[class_id]} {confidence:.2f}"
                for class_id, confidence in zip(detections.class_id, detections.confidence)
            ]
            
            # Annotate the frame
            annotated_frame = frame.copy()
            annotated_frame = box_annotator.annotate(annotated_frame, detections)
            annotated_frame = label_annotator.annotate(annotated_frame, detections, labels=labels)
            
            # Add frame info overlay
            info_text = f"Frame: {frame_idx}/{total_frames} | Detections: {len(detections)}"
            cv2.putText(annotated_frame, info_text, (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Write to output video
            writer.write(annotated_frame)
            
            # Show live preview if enabled (scaled to ~800px width for a manageable window)
            if show_preview:
                preview_frame = annotated_frame
                target_width = 1500
                if width > 0 and width != target_width:
                    scale = target_width / width
                    target_height = int(height * scale)
                    preview_frame = cv2.resize(
                        annotated_frame,
                        (target_width, target_height),
                        interpolation=cv2.INTER_AREA,
                    )

                cv2.imshow("Road Anomaly Detection - Processing (Press 'q' to quit)", preview_frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    print("\n⚠️  Processing stopped by user")
                    break
            
            # Print progress
            if frame_idx % 30 == 0:
                progress = (frame_idx / total_frames) * 100 if total_frames > 0 else 0
                print(f"  Progress: {progress:.1f}% - Frame {frame_idx}/{total_frames} (Detections: {len(detections)})")
            
            frame_idx += 1
        
        print(f"\n✅ Done! Processed {frame_idx} frames")
        print(f"💾 Annotated video saved to: {output_path}")
        print(f"📺 You can now open and watch the processed video!")
        
    except Exception as e:
        print(f"\n❌ Error during video processing: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up
        cap.release()
        writer.release()
        if show_preview:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    print("=" * 60)
    print("🚗 Road Anomaly Detection - Video Processor")
    print("=" * 60)
    print()
    
    process_video_with_detection(
        video_path=VIDEO_PATH,
        model_path=MODEL_PATH,
        conf=CONFIDENCE_THRESHOLD,
        output_dir=OUTPUT_FOLDER,
        show_preview=SHOW_LIVE_PREVIEW
    )
    
    print("\n" + "=" * 60)
    print("🏁 All done!")
    print("=" * 60)

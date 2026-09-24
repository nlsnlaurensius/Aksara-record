import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraPreview } from './components/CameraPreview';
import { QuestionVideo } from './components/QuestionVideo';
import { createSessionZip, downloadBlob } from './export/create-zip';
import { startRecording, type ActiveRecording } from './media/recorder';
import { createSessionId } from './lib/session-id';
import {
  getSelectedTake,
  getSessionTakes,
  removeSessionData,
  saveSelectedTake,
} from './storage/database';
import { EMPTY_QUALITY, type QualityState, type Question, type SelectedTake } from './types';

type Stage = 'tutorial' | 'setup' | 'session' | 'finished';

export function App() {
  const demo = import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'session';
  const [stage, setStage] = useState<Stage>(demo ? 'session' : 'tutorial');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsError, setQuestionsError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [quality, setQuality] = useState<QualityState>(demo ? demoQuality() : EMPTY_QUALITY);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [sessionId, setSessionId] = useState(demo ? createSessionId() : '');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTakes, setSelectedTakes] = useState<Record<string, SelectedTake>>({});
  const [recording, setRecording] = useState(false);
  const [questionPlaying, setQuestionPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordStartedAt, setRecordStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [localDataRemoved, setLocalDataRemoved] = useState(false);

  const currentQuestion = questions[currentIndex];
  const currentTake = currentQuestion ? selectedTakes[currentQuestion.id] : undefined;
  const supportProblems = useMemo(checkBrowserSupport, []);

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}questions.json`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Question[]>;
      })
      .then((items) => {
        if (!Array.isArray(items) || items.length === 0) {
          throw new Error('Daftar pertanyaan kosong.');
        }
        setQuestions(items);
      })
      .catch(() => setQuestionsError('Daftar pertanyaan tidak dapat dibaca. Periksa questions.json.'));
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - recordStartedAt) / 1_000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recordStartedAt, recording]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const loadDevices = useCallback(async (activeStream: MediaStream) => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextCameras = devices.filter((device) => device.kind === 'videoinput');
    const nextMicrophones = devices.filter((device) => device.kind === 'audioinput');
    setCameras(nextCameras);
    setMicrophones(nextMicrophones);
    setCameraId(activeStream.getVideoTracks()[0]?.getSettings().deviceId ?? nextCameras[0]?.deviceId ?? '');
    setMicrophoneId(
      activeStream.getAudioTracks()[0]?.getSettings().deviceId ?? nextMicrophones[0]?.deviceId ?? '',
    );
  }, []);

  const requestMedia = useCallback(
    async (nextCameraId = '', nextMicrophoneId = '') => {
      setMediaBusy(true);
      setMessage('');
      setQuality(EMPTY_QUALITY);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: nextCameraId
            ? {
                deviceId: { exact: nextCameraId },
                width: { ideal: 1280 },
                height: { ideal: 960 },
                frameRate: { ideal: 30, max: 30 },
              }
            : {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 960 },
                frameRate: { ideal: 30, max: 30 },
              },
          audio: nextMicrophoneId
            ? { deviceId: { exact: nextMicrophoneId }, echoCancellation: true, noiseSuppression: true }
            : { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = nextStream;
        setStream(nextStream);
        await loadDevices(nextStream);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        setMessage(
          name === 'NotAllowedError'
            ? 'Izin kamera atau mikrofon ditolak. Buka pengaturan situs di browser lalu izinkan keduanya.'
            : 'Kamera atau mikrofon tidak dapat dibuka. Pastikan perangkat tidak dipakai aplikasi lain.',
        );
      } finally {
        setMediaBusy(false);
      }
    },
    [loadDevices],
  );

  const openSetup = async () => {
    setStage('setup');
    if (supportProblems.length === 0) {
      await requestMedia();
    }
  };

  const beginSession = async () => {
    if (!quality.ready || !stream || questions.length === 0) return;
    const id = createSessionId();
    setSessionId(id);
    setCurrentIndex(0);
    setSelectedTakes({});
    setMessage('');
    setStage('session');
    try {
      await navigator.storage?.persist?.();
    } catch {}
  };

  const beginRecording = async () => {
    const microphoneTrack = stream?.getAudioTracks()[0];
    if (!currentQuestion || !canvasRef.current || !microphoneTrack || !quality.ready || questionPlaying) return;
    setMessage('');
    try {
      activeRecordingRef.current = await startRecording(canvasRef.current, microphoneTrack);
      setElapsedSeconds(0);
      setRecordStartedAt(performance.now());
      setRecording(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Perekaman tidak dapat dimulai.');
    }
  };

  const stopRecording = async () => {
    const activeRecording = activeRecordingRef.current;
    if (!activeRecording || !currentQuestion) return;
    setSaving(true);
    setMessage('Menyimpan rekaman…');

    try {
      const media = await activeRecording.stop();
      const previousTake = await getSelectedTake(sessionId, currentQuestion.id);
      const take: SelectedTake = {
        key: `${sessionId}:${currentQuestion.id}`,
        sessionId,
        questionId: currentQuestion.id,
        questionIndex: currentIndex,
        takeNumber: (previousTake?.takeNumber ?? 0) + 1,
        recordedAt: new Date().toISOString(),
        ...media,
      };
      await saveSelectedTake(take);
      setSelectedTakes((current) => ({ ...current, [currentQuestion.id]: take }));
      setMessage(`Take T${String(take.takeNumber).padStart(2, '0')} tersimpan dan dipilih.`);
    } catch (error) {
      setMessage(
        `Rekaman baru gagal disimpan. ${currentTake ? 'Take sebelumnya tetap aman.' : 'Silakan rekam ulang.'}`,
      );
      console.error(error);
    } finally {
      activeRecordingRef.current = null;
      setRecording(false);
      setSaving(false);
    }
  };

  const nextQuestion = () => {
    if (!currentTake || recording || saving) return;
    setMessage('');
    setQuestionPlaying(false);
    setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
  };

  const finishSession = async () => {
    if (!currentTake || recording || saving) return;
    setExportBusy(true);
    setMessage('Menyiapkan ZIP…');
    try {
      const takes = await getSessionTakes(sessionId);
      const archive = await createSessionZip(sessionId, questions, takes);
      setZipBlob(archive);
      downloadBlob(archive, `${sessionId}.zip`);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setStage('finished');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ZIP tidak dapat dibuat.');
    } finally {
      setExportBusy(false);
    }
  };

  const deleteLocalData = async () => {
    const confirmed = window.confirm(
      'Hapus rekaman sesi ini dari penyimpanan browser? Pastikan tim peneliti sudah mengonfirmasi ZIP diterima dan dapat dibuka.',
    );
    if (!confirmed) return;
    await removeSessionData(sessionId);
    setSelectedTakes({});
    setZipBlob(null);
    setLocalDataRemoved(true);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="AKSARA Recorder">
          <span className="brand-mark">A</span>
          <span>AKSARA Recorder</span>
        </a>
        {sessionId && <span className="session-pill">ID {sessionId}</span>}
      </header>

      {stage === 'tutorial' && (
        <main className="tutorial-page page-width">
          <section className="hero-card">
            <div>
              <span className="eyebrow">Perekaman mandiri</span>
              <h1>Siapkan posisi sebelum memulai sesi</h1>
              <p>
                Aplikasi merekam satu jawaban untuk setiap video pertanyaan. Tidak ada nama, inisial,
                username perangkat, atau identitas partisipan yang disimpan.
              </p>
            </div>
            <div className="ratio-illustration" aria-hidden="true">
              <div className="mini-question">▶</div>
              <div className="mini-camera"><span /></div>
            </div>
          </section>

          <div className="tutorial-grid">
            <section className="content-card">
              <span className="step-number">01</span>
              <h2>Atur kamera</h2>
              <p>Pilih kamera dan mikrofon, lalu ikuti garis kepala, leher, bahu, dan tubuh bagian atas.</p>
            </section>
            <section className="content-card">
              <span className="step-number">02</span>
              <h2>Dengarkan pertanyaan</h2>
              <p>Video psikolog dapat diputar ulang. Perekaman tidak pernah dimulai otomatis.</p>
            </section>
            <section className="content-card">
              <span className="step-number">03</span>
              <h2>Rekam jawaban</h2>
              <p>Tekan Mulai Rekam saat siap. Tombol Berikutnya hanya aktif setelah take tersimpan.</p>
            </section>
            <section className="content-card">
              <span className="step-number">04</span>
              <h2>Unduh satu ZIP</h2>
              <p>ZIP hanya berisi take terakhir yang dipilih untuk setiap pertanyaan, dipisah per folder.</p>
            </section>
          </div>

          {supportProblems.length > 0 && (
            <div className="notice notice--error" role="alert">
              <strong>Browser belum siap</strong>
              <ul>{supportProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </div>
          )}
          {questionsError && <div className="notice notice--error">{questionsError}</div>}
          <div className="tutorial-action">
            <button
              className="primary-button"
              onClick={openSetup}
              disabled={supportProblems.length > 0 || Boolean(questionsError) || questions.length === 0}
            >
              Pilih kamera &amp; mikrofon
            </button>
            <small>Izin perangkat baru diminta setelah tombol ini ditekan.</small>
          </div>
        </main>
      )}

      {stage === 'setup' && (
        <main className="setup-page page-width">
          <div className="page-heading">
            <span className="eyebrow">Pemeriksaan awal</span>
            <h1>Sesuaikan posisi dan perangkat</h1>
            <p>Ketiga pemeriksaan harus siap sebelum sesi dapat dimulai.</p>
          </div>
          <div className="setup-grid">
            <CameraPreview
              stream={stream}
              canvasRef={canvasRef}
              quality={quality}
              onQualityChange={setQuality}
            />
            <section className="device-card">
              <h2>Perangkat rekaman</h2>
              <label>
                <span>Kamera</span>
                <select
                  value={cameraId}
                  disabled={mediaBusy || cameras.length === 0}
                  onChange={(event) => {
                    setCameraId(event.target.value);
                    void requestMedia(event.target.value, microphoneId);
                  }}
                >
                  {cameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Kamera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Mikrofon</span>
                <select
                  value={microphoneId}
                  disabled={mediaBusy || microphones.length === 0}
                  onChange={(event) => {
                    setMicrophoneId(event.target.value);
                    void requestMedia(cameraId, event.target.value);
                  }}
                >
                  {microphones.map((microphone, index) => (
                    <option key={microphone.deviceId} value={microphone.deviceId}>
                      {microphone.label || `Mikrofon ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="setup-guidance">
                <strong>{quality.ready ? 'Posisi siap' : 'Belum siap'}</strong>
                <p>{quality.message}</p>
              </div>
              {message && <div className="notice notice--error">{message}</div>}
              <button
                className="primary-button setup-start-button"
                onClick={beginSession}
                disabled={!quality.ready || !stream || mediaBusy}
              >
                Mulai Sesi
              </button>
              <button className="text-button" onClick={() => setStage('tutorial')}>
                Kembali ke petunjuk
              </button>
            </section>
          </div>
        </main>
      )}

      {stage === 'session' && currentQuestion && (
        <main className="session-page page-width">
          <div className="progress-line" aria-label={`Pertanyaan ${currentIndex + 1} dari ${questions.length}`}>
            <span style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
          <div className="session-grid">
            <QuestionVideo
              question={currentQuestion}
              index={currentIndex}
              total={questions.length}
              disabled={recording}
              onPlaybackChange={setQuestionPlaying}
            />
            <section className="answer-card" aria-label="Kamera dan perekaman jawaban">
              <CameraPreview
                stream={stream}
                canvasRef={canvasRef}
                quality={quality}
                onQualityChange={setQuality}
                demo={demo}
                recording={recording}
                elapsed={formatDuration(elapsedSeconds)}
              />
              <div className="recording-controls">
                <div className="take-status" aria-live="polite">
                  <span className={currentTake ? 'take-dot is-saved' : 'take-dot'} />
                  <div>
                    <strong>{currentTake ? `T${String(currentTake.takeNumber).padStart(2, '0')} tersimpan` : 'Belum ada rekaman'}</strong>
                    <small>
                      {message ||
                        (questionPlaying
                          ? 'Selesaikan atau jeda video pertanyaan sebelum merekam.'
                          : quality.ready
                            ? 'Posisi siap untuk merekam.'
                            : quality.message)}
                    </small>
                  </div>
                </div>
                <div className="button-row">
                  {recording ? (
                    <button className="record-button is-recording" onClick={stopRecording} disabled={saving}>
                      <span /> Selesai Rekam
                    </button>
                  ) : (
                    <button
                      className="record-button"
                      onClick={beginRecording}
                      disabled={!quality.ready || questionPlaying || saving || exportBusy || (!stream && !demo)}
                    >
                      <span /> {currentTake ? 'Rekam Ulang' : 'Mulai Rekam'}
                    </button>
                  )}
                  {currentIndex < questions.length - 1 ? (
                    <button className="primary-button next-button" onClick={nextQuestion} disabled={!currentTake || recording || saving}>
                      Berikutnya →
                    </button>
                  ) : (
                    <button className="primary-button next-button" onClick={finishSession} disabled={!currentTake || recording || saving || exportBusy}>
                      {exportBusy ? 'Membuat ZIP…' : 'Selesaikan Sesi'}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      )}

      {stage === 'session' && !currentQuestion && (
        <main className="center-state">Memuat pertanyaan…</main>
      )}

      {stage === 'finished' && (
        <main className="finished-page page-width">
          <section className="finished-card">
            <div className="success-icon">✓</div>
            <span className="eyebrow">Sesi selesai</span>
            <h1>ZIP sudah dibuat</h1>
            <p className="archive-name">{sessionId}.zip</p>
            <p>
              Unggah ZIP tersebut secara manual melalui Google Form yang diberikan tim peneliti. Jangan
              mengubah nama file, membuka isinya, atau memindahkan file di dalam ZIP.
            </p>
            <div className="notice notice--reminder">
              <strong>Pengingat pengiriman</strong>
              <p>
                Pastikan upload selesai sebelum menutup Google Form. Batas pengiriman mengikuti informasi
                dari tim peneliti.
              </p>
            </div>
            <div className="finished-actions">
              <button
                className="primary-button"
                disabled={!zipBlob}
                onClick={() => zipBlob && downloadBlob(zipBlob, `${sessionId}.zip`)}
              >
                Unduh ZIP lagi
              </button>
              <button className="danger-button" onClick={deleteLocalData} disabled={localDataRemoved}>
                {localDataRemoved ? 'Data lokal sudah dihapus' : 'Hapus data lokal'}
              </button>
            </div>
            <small>
              Simpan ZIP dan data lokal sampai tim mengonfirmasi file diterima dan dapat dibuka. Setelah
              konfirmasi, hapus ZIP dari folder unduhan dan hapus data lokal paling lambat tujuh hari.
            </small>
          </section>
        </main>
      )}
    </div>
  );
}

function checkBrowserSupport(): string[] {
  const problems: string[] = [];
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    problems.push('Halaman harus dibuka melalui HTTPS agar kamera dan mikrofon dapat digunakan.');
  }
  if (!navigator.mediaDevices?.getUserMedia) problems.push('Browser tidak mendukung akses kamera/mikrofon.');
  if (!window.MediaRecorder) problems.push('Browser tidak mendukung perekaman MediaRecorder.');
  if (!HTMLCanvasElement.prototype.captureStream) problems.push('Browser tidak mendukung perekaman kanvas.');
  if (!window.indexedDB) problems.push('Browser tidak menyediakan penyimpanan lokal IndexedDB.');
  if (!window.crypto?.getRandomValues) problems.push('Browser tidak menyediakan pembuat ID sesi yang aman.');
  return problems;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function demoQuality(): QualityState {
  return {
    faceVisible: true,
    lightGood: true,
    positionGood: true,
    ready: true,
    message: 'Posisi siap. Anda dapat mulai merekam.',
    brightness: 128,
  };
}

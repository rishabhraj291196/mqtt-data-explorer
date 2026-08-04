import { useMemo, useState } from 'react'
import { EyeIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { JsonView } from '@/components/json-view'
import { TokenHelp } from '@/components/token-help'
import { api } from '@/lib/api'
import { DEVICE_ID_FORMATS, generateDeviceId } from '@/lib/device-id'
import { BLANK_TEMPLATE, TEMPLATE_PRESETS } from '@/lib/presets'
import type {
  DeviceIdFormat,
  Machine,
  MachineInput,
  PreviewResponse,
  QoS,
} from '@/lib/types'

interface FormState {
  name: string
  description: string
  deviceId: string
  deviceIdFormat: DeviceIdFormat
  url: string
  username: string
  password: string
  clientId: string
  keepalive: string
  cleanSession: boolean
  topic: string
  qos: QoS
  retain: boolean
  intervalMs: string
  payloadTemplate: string
  autoStart: boolean
}

const INTERVAL_PRESETS = [
  { label: '500ms', value: 500 },
  { label: '1s', value: 1000 },
  { label: '5s', value: 5000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
]

function emptyForm(defaultBrokerUrl: string): FormState {
  return {
    name: '',
    description: '',
    deviceId: generateDeviceId('numeric'),
    deviceIdFormat: 'numeric',
    url: defaultBrokerUrl,
    username: '',
    password: '',
    clientId: '',
    keepalive: '60',
    cleanSession: true,
    topic: 'devices/{{machineName}}/telemetry',
    qos: 0,
    retain: false,
    intervalMs: '2000',
    payloadTemplate: BLANK_TEMPLATE,
    autoStart: false,
  }
}

function toForm(machine: Machine): FormState {
  return {
    name: machine.name,
    description: machine.description ?? '',
    deviceId: machine.deviceId,
    deviceIdFormat: machine.deviceIdFormat,
    url: machine.broker.url,
    username: machine.broker.username ?? '',
    password: machine.broker.password ?? '',
    clientId: machine.broker.clientId ?? '',
    keepalive: String(machine.broker.keepalive ?? 60),
    cleanSession: machine.broker.cleanSession ?? true,
    topic: machine.publish.topic,
    qos: machine.publish.qos,
    retain: machine.publish.retain,
    intervalMs: String(machine.publish.intervalMs),
    payloadTemplate: machine.publish.payloadTemplate,
    autoStart: machine.autoStart,
  }
}

function toInput(form: FormState): MachineInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    deviceId: form.deviceId.trim(),
    deviceIdFormat: form.deviceIdFormat,
    broker: {
      url: form.url.trim(),
      username: form.username.trim() || undefined,
      password: form.password || undefined,
      clientId: form.clientId.trim() || undefined,
      keepalive: Number(form.keepalive) || 60,
      cleanSession: form.cleanSession,
    },
    publish: {
      topic: form.topic.trim(),
      qos: form.qos,
      retain: form.retain,
      intervalMs: Number(form.intervalMs) || 1000,
      payloadTemplate: form.payloadTemplate,
    },
    autoStart: form.autoStart,
  }
}

export function MachineDialog({
  open,
  onOpenChange,
  machine,
  defaultBrokerUrl,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine | null
  defaultBrokerUrl: string
  onSubmit: (input: MachineInput) => Promise<unknown>
}) {
  // App mounts this component fresh (keyed) every time the dialog opens, so the
  // initial state below is always the right starting point — no reset effect.
  const [form, setForm] = useState<FormState>(() =>
    machine ? toForm(machine) : emptyForm(defaultBrokerUrl),
  )
  const [tab, setTab] = useState('device')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /** Switching to a generated format immediately mints a matching id. */
  const changeDeviceIdFormat = (format: DeviceIdFormat) =>
    setForm((prev) => ({
      ...prev,
      deviceIdFormat: format,
      deviceId: format === 'custom' ? prev.deviceId : generateDeviceId(format),
    }))

  const problems = useMemo(() => {
    const list: string[] = []
    if (!form.name.trim()) list.push('Machine name is required')
    if (!form.deviceId.trim()) list.push('Device ID is required')
    else if (!/^[A-Za-z0-9._:-]+$/.test(form.deviceId.trim())) {
      list.push('Device ID may only contain letters, digits and . _ : -')
    }
    if (!form.url.trim()) list.push('Broker URL is required')
    if (!form.topic.trim()) list.push('Topic is required')
    if (!Number(form.intervalMs) || Number(form.intervalMs) < 100) {
      list.push('Interval must be 100ms or more')
    }
    if (!form.payloadTemplate.trim()) list.push('Payload template is required')
    return list
  }, [form])

  const rate = useMemo(() => {
    const ms = Number(form.intervalMs)
    if (!ms) return ''
    const perSecond = 1000 / ms
    return perSecond >= 1
      ? `${perSecond.toFixed(1)} messages/second`
      : `1 message every ${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`
  }, [form.intervalMs])

  const runPreview = async () => {
    setPreviewing(true)
    try {
      setPreview(
        await api.preview({
          payloadTemplate: form.payloadTemplate,
          topic: form.topic,
          machineName: form.name || 'preview-machine',
          deviceId: form.deviceId,
          samples: 3,
        }),
      )
    } catch (error) {
      setPreview({ ok: false, error: (error as Error).message, samples: [] })
    } finally {
      setPreviewing(false)
    }
  }

  const applyPreset = (presetId: string) => {
    const preset = TEMPLATE_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setForm((prev) => ({
      ...prev,
      topic: preset.topic,
      intervalMs: String(preset.intervalMs),
      payloadTemplate: preset.template,
    }))
    setPreview(null)
  }

  const save = async () => {
    if (problems.length > 0) return
    setSaving(true)
    const result = await onSubmit(toInput(form))
    setSaving(false)
    if (result !== undefined) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-4 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {machine ? `Configure ${machine.name}` : 'New simulated machine'}
          </DialogTitle>
          <DialogDescription>
            Point it at a broker, describe the JSON you want, and it will publish
            on a timer like a real device.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList className="w-full">
            <TabsTrigger value="device">Device &amp; broker</TabsTrigger>
            <TabsTrigger value="payload">Payload &amp; schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="device" className="grid gap-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Machine name</Label>
                <Input
                  id="name"
                  value={form.name}
                  placeholder="Boiler Sensor 01"
                  onChange={(event) => set('name', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={form.description}
                  placeholder="Ground floor, line A"
                  onChange={(event) => set('description', event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5 rounded-lg bg-muted/40 p-3">
              <Label htmlFor="deviceIdFormat">Device ID</Label>
              <p className="text-xs text-muted-foreground">
                What the device calls itself. Use{' '}
                <code>{'{{deviceId}}'}</code> in the topic or payload; every
                duplicate gets a fresh one.
              </p>
              <div className="grid gap-2 sm:grid-cols-[11rem_1fr_auto]">
                <NativeSelect
                  id="deviceIdFormat"
                  className="w-full"
                  value={form.deviceIdFormat}
                  onChange={(event) => changeDeviceIdFormat(event.target.value as DeviceIdFormat)}
                >
                  {DEVICE_ID_FORMATS.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  id="deviceId"
                  value={form.deviceId}
                  readOnly={form.deviceIdFormat !== 'custom'}
                  placeholder="1206260070"
                  className="font-mono text-sm"
                  onChange={(event) => set('deviceId', event.target.value)}
                />
                {form.deviceIdFormat !== 'custom' && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Generate a new device id"
                    onClick={() => set('deviceId', generateDeviceId(form.deviceIdFormat))}
                  >
                    <RefreshCwIcon />
                    New
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {DEVICE_ID_FORMATS.find((o) => o.value === form.deviceIdFormat)?.hint}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="url">Broker URL</Label>
              <Input
                id="url"
                value={form.url}
                placeholder="mqtt://localhost:1883"
                onChange={(event) => set('url', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                mqtt:// · mqtts:// · ws:// · wss:// — e.g. mqtt://localhost:1883 for a
                local Mosquitto.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="username">Username (optional)</Label>
                <Input
                  id="username"
                  value={form.username}
                  autoComplete="off"
                  onChange={(event) => set('username', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password (optional)</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(event) => set('password', event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="clientId">Client ID (optional)</Label>
                <Input
                  id="clientId"
                  value={form.clientId}
                  placeholder="auto-generated from the name"
                  onChange={(event) => set('clientId', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="keepalive">Keep-alive (seconds)</Label>
                <Input
                  id="keepalive"
                  type="number"
                  min={5}
                  value={form.keepalive}
                  onChange={(event) => set('keepalive', event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 rounded-lg bg-muted/40 p-3">
              <Label className="gap-2">
                <Switch
                  checked={form.cleanSession}
                  onCheckedChange={(checked) => set('cleanSession', checked)}
                />
                Clean session
              </Label>
              <Label className="gap-2">
                <Switch
                  checked={form.autoStart}
                  onCheckedChange={(checked) => set('autoStart', checked)}
                />
                Start automatically when the server boots
              </Label>
            </div>
          </TabsContent>

          <TabsContent value="payload" className="grid gap-4 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="preset">Start from a preset</Label>
              <NativeSelect
                id="preset"
                className="w-full"
                defaultValue=""
                onChange={(event) => applyPreset(event.target.value)}
              >
                <NativeSelectOption value="">Choose a device type…</NativeSelectOption>
                {TEMPLATE_PRESETS.map((preset) => (
                  <NativeSelectOption key={preset.id} value={preset.id}>
                    {preset.label} — {preset.hint}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="topic">Publish topic</Label>
              <Input
                id="topic"
                value={form.topic}
                className="font-mono text-sm"
                onChange={(event) => set('topic', event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="interval">Interval (ms)</Label>
                <Input
                  id="interval"
                  type="number"
                  min={100}
                  value={form.intervalMs}
                  onChange={(event) => set('intervalMs', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{rate}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qos">QoS</Label>
                <NativeSelect
                  id="qos"
                  className="w-full"
                  value={String(form.qos)}
                  onChange={(event) => set('qos', Number(event.target.value) as QoS)}
                >
                  <NativeSelectOption value="0">0 — at most once</NativeSelectOption>
                  <NativeSelectOption value="1">1 — at least once</NativeSelectOption>
                  <NativeSelectOption value="2">2 — exactly once</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label>Retain</Label>
                <div className="flex h-8 items-center">
                  <Switch
                    checked={form.retain}
                    onCheckedChange={(checked) => set('retain', checked)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => set('intervalMs', String(preset.value))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="template">JSON payload template</Label>
                <div className="flex gap-1.5">
                  <TokenHelp />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewing}
                    onClick={() => void runPreview()}
                  >
                    <EyeIcon />
                    {previewing ? 'Rendering…' : 'Preview'}
                  </Button>
                </div>
              </div>
              <Textarea
                id="template"
                value={form.payloadTemplate}
                spellCheck={false}
                className="min-h-56 font-mono text-xs"
                onChange={(event) => set('payloadTemplate', event.target.value)}
              />
            </div>

            {preview && (
              <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
                {preview.ok ? (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">
                      Sample messages that would be published
                    </p>
                    {preview.samples.map((sample, index) => (
                      <div key={index} className="grid min-w-0 gap-0.5">
                        {sample.topic && (
                          <code className="font-mono text-[11px] break-all text-primary">
                            {sample.topic}
                          </code>
                        )}
                        <JsonView
                          value={sample.payload}
                          className="max-h-56 overflow-y-auto"
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="flex gap-2 text-sm text-destructive">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    {preview.error}
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {problems.length > 0 && (
          <ul className="grid gap-1 text-xs text-destructive">
            {problems.map((problem) => (
              <li key={problem}>• {problem}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={problems.length > 0 || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : machine ? 'Save changes' : 'Create machine'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

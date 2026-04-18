import React, { useMemo, useEffect } from 'react';
import { Zap, ChevronDown, Volume2, Info, Wand2, Settings2, Globe, Sliders, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TTSConfig } from '../types';
import { VOICE_OPTIONS, MODEL_OPTIONS, MODEL_VOICE_MAPPING } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';

interface VoiceConfigProps {
  config: TTSConfig;
  setConfig: (config: TTSConfig) => void;
  isDarkMode: boolean;
  isAdmin?: boolean;
  selectedModel: string;
}

export const VoiceConfig: React.FC<VoiceConfigProps> = ({ config, setConfig, isDarkMode, isAdmin = false, selectedModel }) => {
  const { t } = useLanguage();
  
  // Flash 3.1 Exclusive Logic
  const isFlash31 = selectedModel === 'gemini-3.1-flash-tts-preview';
  
  const QUICK_STYLES = [
    { label: t('voiceConfig.styles.warm'), value: 'Warm and friendly' },
    { label: t('voiceConfig.styles.professional'), value: 'Professional and authoritative' },
    { label: t('voiceConfig.styles.excited'), value: 'Excited and energetic' },
    { label: t('voiceConfig.styles.angry'), value: 'Angry and intense' },
    { label: t('voiceConfig.styles.sad'), value: 'Sad and emotional' },
    { label: t('voiceConfig.styles.whisper'), value: 'Whispering and soft' },
  ];

  const VOCAL_STYLES = ['Neutral', 'Expressive', 'Energetic', 'Calm'] as const;

  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

  const handleChange = (key: keyof TTSConfig, value: any) => {
    setConfig({ ...config, [key]: value });
  };

  // Filtered voices based on selected model
  const filteredVoices = useMemo(() => {
    const supportedVoiceIds = MODEL_VOICE_MAPPING[config.model] || [];
    return VOICE_OPTIONS.filter(voice => supportedVoiceIds.includes(voice.id));
  }, [config.model]);

  // Reset voice if not supported by new model
  useEffect(() => {
    const isSupported = filteredVoices.some(v => v.id === config.voiceId);
    if (!isSupported && filteredVoices.length > 0) {
      handleChange('voiceId', filteredVoices[0].id);
    }
  }, [config.model, filteredVoices]);

  const availableModels = useMemo(() => {
    if (isAdmin) return MODEL_OPTIONS;
    return MODEL_OPTIONS.filter(m => m.id !== 'gemini-3.1-flash-lite-preview');
  }, [isAdmin]);

  return (
    <div className="premium-glass rounded-[32px] p-8 sm:p-10 shadow-2xl transition-all duration-300 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-purple/5 blur-[100px] -z-10" />
      <div className="space-y-10">
        {/* Model Selection */}
        <div className="group">
          <label className="flex items-center gap-3 text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 group-hover:text-brand-purple transition-colors">
            <div className="p-2 bg-brand-purple/10 rounded-lg">
              <Zap size={20} className="text-brand-purple" />
            </div>
            {t('voiceConfig.model')}
          </label>
          <div className="relative">
            <select
              value={config.model}
              onChange={(e) => handleChange('model', e.target.value)}
              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-[20px] px-6 py-4 text-slate-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 transition-all cursor-pointer font-bold shadow-inner"
            >
              {availableModels.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                  {opt.name}
                </option>
              ))}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown size={20} />
            </div>
          </div>
        </div>

        {/* Voice Selection */}
        <div className="group">
          <label className="flex items-center gap-3 text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 group-hover:text-brand-purple transition-colors">
            <div className="p-2 bg-brand-purple/10 rounded-lg">
              <Volume2 size={20} className="text-brand-purple" />
            </div>
            {t('voiceConfig.voice')}
          </label>
          <div className="relative">
            <select
              value={config.voiceId}
              onChange={(e) => handleChange('voiceId', e.target.value)}
              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-[20px] px-6 py-4 text-slate-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 transition-all cursor-pointer font-bold shadow-inner"
            >
              {filteredVoices.map((voice) => (
                <option key={voice.id} value={voice.id} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
                  {voice.name}
                </option>
              ))}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown size={20} />
            </div>
          </div>
        </div>

        {/* Style Instructions */}
        <div className="group">
          <label className="flex items-center gap-3 text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 group-hover:text-brand-purple transition-colors">
            <div className="p-2 bg-brand-purple/10 rounded-lg">
              <Wand2 size={20} className="text-brand-purple" />
            </div>
            {t('voiceConfig.style')}
          </label>
          <div className="space-y-5">
            <input
              type="text"
              value={config.styleInstruction || ''}
              onChange={(e) => handleChange('styleInstruction', e.target.value)}
              placeholder={t('voiceConfig.stylePlaceholder')}
              className="w-full bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-[20px] px-6 py-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30 transition-all font-bold placeholder:text-slate-400 shadow-inner"
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_STYLES.map((style) => (
                <button
                  key={style.label}
                  onClick={() => handleChange('styleInstruction', style.value)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    config.styleInstruction === style.value
                      ? 'bg-brand-purple text-white border-brand-purple shadow-lg shadow-brand-purple/30'
                      : 'bg-white/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-brand-purple/50 hover:text-brand-purple'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vocal Style Selection - Flash 3.1 Exclusive */}
        <AnimatePresence>
          {isFlash31 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="group overflow-hidden"
            >
              <label className="flex items-center gap-3 text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 group-hover:text-brand-purple transition-colors">
                <div className="p-2 bg-brand-purple/10 rounded-lg">
                  <Flame size={20} className="text-brand-purple" />
                </div>
                {t('voiceConfig.vocalStyle')}
              </label>
              <div className="flex flex-wrap gap-2">
                {VOCAL_STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => handleChange('vocalStyle', style)}
                    className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border ${
                      (config.vocalStyle || 'Neutral') === style
                        ? 'bg-brand-purple text-white border-brand-purple shadow-lg shadow-brand-purple/30'
                        : 'bg-white/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-brand-purple/50'
                    }`}
                  >
                    {t(`voiceConfig.vocalStyles.${style.toLowerCase()}` as any)}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Advanced Accordion - Flash 3.1 Exclusive */}
        <AnimatePresence>
          {isFlash31 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border border-slate-200 dark:border-white/5 rounded-[28px] overflow-hidden transition-all duration-300"
            >
              <button 
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full flex items-center justify-between p-5 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Settings2 size={18} className="text-brand-purple" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{t('voiceConfig.advanced')}</span>
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isAdvancedOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isAdvancedOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="p-6 space-y-8 bg-white/30 dark:bg-slate-950/30"
                  >
                    <div className="space-y-4">
                      <Slider
                        label={t('voiceConfig.creativity')}
                        value={config.creativityLevel || 0.4}
                        min={0.2}
                        max={0.8}
                        step={0.1}
                        suffix=""
                        onChange={(v) => handleChange('creativityLevel', v)}
                        isDarkMode={isDarkMode}
                      />
                      <div className="flex justify-between px-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{t('voiceConfig.creativityLow')}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{t('voiceConfig.creativityHigh')}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <ToggleSwitch 
                        label={t('voiceConfig.grounding')}
                        icon={<Globe size={16} />}
                        enabled={config.useGrounding || false}
                        onChange={(v) => handleChange('useGrounding', v)}
                      />
                      <ToggleSwitch 
                        label={t('voiceConfig.hiFi')}
                        icon={<Sliders size={16} />}
                        enabled={config.highFidelity || false}
                        onChange={(v) => handleChange('highFidelity', v)}
                      />
                      <ToggleSwitch 
                        label={t('voiceConfig.fastTrack')}
                        icon={< Zap size={16} />}
                        enabled={config.fastTrack || false}
                        onChange={(v) => handleChange('fastTrack', v)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-8">
          <Slider
            label={t('voiceConfig.pitch')}
            value={config.pitch}
            min={-20.0}
            max={20.0}
            step={0.5}
            suffix=""
            onChange={(v) => handleChange('pitch', v)}
            isDarkMode={isDarkMode}
          />
          <div className="flex items-center gap-3 px-5 py-3 bg-brand-purple/5 border border-brand-purple/10 rounded-2xl">
            <Info size={16} className="text-brand-purple shrink-0" />
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              {t('voiceConfig.changesApplyNext')}
            </p>
          </div>
          <Slider
            label={t('voiceConfig.volume')}
            value={config.volume}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => handleChange('volume', v)}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>
    </div>
  );
};

interface ToggleSwitchProps {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onChange: (v: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, icon, enabled, onChange }) => (
  <div className="flex items-center justify-between py-1">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${enabled ? 'bg-brand-purple/10 text-brand-purple' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
        {icon}
      </div>
      <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{label}</span>
    </div>
    <button
      onClick={() => onChange(!enabled)}
      className={`w-10 h-5 rounded-full transition-all relative ${enabled ? 'bg-brand-purple' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-5.5' : 'left-0.5'}`} />
    </button>
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
  isDarkMode: boolean;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, suffix, onChange, isDarkMode }) => {
  return (
    <div className="group">
      <div className="flex justify-between items-center mb-5">
        <span className="text-base font-bold text-slate-700 dark:text-slate-200 group-hover:text-brand-purple transition-colors">{label}</span>
        <div className="px-3 py-1 bg-brand-purple/10 rounded-lg">
          <span className="text-sm font-bold text-brand-purple">
            {value > 0 && (label === 'Pitch' || label === 'အသံအနိမ့်အမြင့်') ? `+${value}` : value}
            {suffix}
          </span>
        </div>
      </div>
      <div className="relative flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-200 dark:bg-white/5 rounded-full appearance-none cursor-pointer accent-brand-purple hover:bg-slate-300 dark:hover:bg-white/10 transition-colors"
          style={{
            background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${( (value - min) / (max - min) ) * 100}%, ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'} ${( (value - min) / (max - min) ) * 100}%, ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'} 100%)`
          }}
        />
      </div>
    </div>
  );
};

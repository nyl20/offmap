import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { signInWithOAuth } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';

type Method = 'phone' | 'email';
type PhoneStage = 'enter-phone' | 'enter-code';
type EmailMode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [phoneStage, setPhoneStage] = useState<PhoneStage>('enter-phone');
  const [code, setCode] = useState('');

  const [emailMode, setEmailMode] = useState<EmailMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleOAuth(provider: 'google' | 'facebook') {
    setError(null);
    setLoading(true);
    const { error: oauthError } = await signInWithOAuth(provider);
    setLoading(false);
    if (oauthError) setError(oauthError);
    else router.back();
  }

  async function handlePhoneSubmit() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      if (phoneStage === 'enter-phone') {
        const { error: otpError } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
        if (otpError) throw otpError;
        setPhoneStage('enter-code');
      } else {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          phone: phone.trim(),
          token: code.trim(),
          type: 'sms',
        });
        if (verifyError) throw verifyError;
        router.back();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { error: authError } =
        emailMode === 'sign-up'
          ? await supabase.auth.signUp({ email: email.trim(), password })
          : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={styles.hero}>
          <ThemedText style={styles.title}>Sign in to OFFMAP</ThemedText>
          <ThemedText style={styles.subtitle}>Save events and pick up where you left off, on any device.</ThemedText>
        </SafeAreaView>

        <View style={styles.oauthRow}>
          <Pressable style={styles.oauthButton} onPress={() => handleOAuth('google')} disabled={loading}>
            <ThemedText style={styles.oauthButtonText}>Continue with Google</ThemedText>
          </Pressable>
          <Pressable style={styles.oauthButton} onPress={() => handleOAuth('facebook')} disabled={loading}>
            <ThemedText style={styles.oauthButtonText}>Continue with Facebook</ThemedText>
          </Pressable>
        </View>

        <View style={styles.methodRow}>
          <Pressable
            style={[styles.methodPill, method === 'phone' && styles.methodPillActive]}
            onPress={() => {
              setMethod('phone');
              setError(null);
            }}>
            <ThemedText style={[styles.methodPillText, method === 'phone' && styles.methodPillTextActive]}>
              Phone
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.methodPill, method === 'email' && styles.methodPillActive]}
            onPress={() => {
              setMethod('email');
              setError(null);
            }}>
            <ThemedText style={[styles.methodPillText, method === 'email' && styles.methodPillTextActive]}>
              Email
            </ThemedText>
          </Pressable>
        </View>

        {method === 'phone' ? (
          <View style={styles.form}>
            {phoneStage === 'enter-phone' ? (
              <Field
                label="Phone number"
                placeholder="+1 555 555 5555"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            ) : (
              <>
                <ThemedText style={styles.hint}>We texted a code to {phone}.</ThemedText>
                <Field label="Verification code" placeholder="123456" value={code} onChangeText={setCode} keyboardType="number-pad" />
              </>
            )}
            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
            <Pressable style={styles.submitButton} onPress={handlePhoneSubmit} disabled={loading}>
              <ThemedText style={styles.submitButtonText}>
                {loading ? 'Please wait…' : phoneStage === 'enter-phone' ? 'Send code' : 'Verify & sign in'}
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Field label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field label="Password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />
            {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
            <Pressable style={styles.submitButton} onPress={handleEmailSubmit} disabled={loading}>
              <ThemedText style={styles.submitButtonText}>
                {loading ? 'Please wait…' : emailMode === 'sign-up' ? 'Create account' : 'Sign in'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setEmailMode((mode) => (mode === 'sign-up' ? 'sign-in' : 'sign-up'))}>
              <ThemedText style={styles.linkText}>
                {emailMode === 'sign-up' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  secureTextEntry,
  value,
}: {
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.inputShell}>
        <TextInput
          autoCapitalize="none"
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Palette.powderBlue}
          secureTextEntry={secureTextEntry}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.deepNavy,
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 40,
  },
  hero: {
    gap: 6,
    paddingHorizontal: 18,
  },
  title: {
    color: Palette.mintCream,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  subtitle: {
    color: Palette.powderBlue,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  oauthRow: {
    gap: 10,
    paddingHorizontal: 18,
  },
  oauthButton: {
    alignItems: 'center',
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  oauthButtonText: {
    color: Palette.mintCream,
    fontSize: 14,
    fontWeight: '700',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  methodPill: {
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  methodPillActive: {
    backgroundColor: Palette.sunflowerGold,
    borderColor: Palette.sunflowerGold,
  },
  methodPillText: {
    color: Palette.mintCream,
    fontSize: 13,
    fontWeight: '700',
  },
  methodPillTextActive: {
    color: Palette.deepNavy,
  },
  form: {
    gap: 14,
    paddingHorizontal: 18,
  },
  field: {
    gap: 7,
  },
  label: {
    color: Palette.mintCream,
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    paddingHorizontal: 13,
  },
  input: {
    color: Palette.mintCream,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    color: Palette.powderBlue,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: Palette.coral,
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: Palette.sunflowerGold,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 50,
  },
  submitButtonText: {
    color: Palette.deepNavy,
    fontSize: 15,
    fontWeight: '800',
  },
  linkText: {
    color: Palette.powderBlue,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

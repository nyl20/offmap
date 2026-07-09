import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';

const categoryOptions = ['Music', 'Food', 'Art', 'Market', 'Pop-up', 'Other'];

export default function SuggestEventScreen() {
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Suggest an event' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={styles.hero}>
          <View style={styles.heroIcon}>
            <MapMarkerPlusIcon />
          </View>
          <View style={styles.heroCopy}>
            <ThemedText style={styles.title}>Put something on the map</ThemedText>
            <ThemedText style={styles.subtitle}>
              Share a lead, flyer, link, or rumor so someone nearby can check it out.
            </ThemedText>
          </View>
        </SafeAreaView>

        <View style={styles.form}>
          <Field label="Event name" placeholder="Jazz night behind the bookstore" />
          <Field label="Official website or post" placeholder="https://..." keyboardType="url" />
          <Field label="Where did you hear about it?" placeholder="Flyer, friend, group chat, venue board..." />
          <Field label="Location" placeholder="Venue name, address, or cross streets" />
          <View style={styles.field}>
            <ThemedText style={styles.label}>Category</ThemedText>
            <ScrollView
              contentContainerStyle={styles.categoryRail}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {categoryOptions.map((category, index) => (
                <Pressable
                  key={category}
                  style={[styles.categoryPill, index === 0 && styles.categoryPillActive]}>
                  <ThemedText
                    style={[styles.categoryPillText, index === 0 && styles.categoryPillTextActive]}>
                    {category}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Field label="Pics or poster" placeholder="Add image upload later" trailingIcon="photo" />
          <Field
            label="Notes"
            multiline
            placeholder="What should people know before they go?"
          />

          <Pressable style={styles.submitButton}>
            <ThemedText style={styles.submitButtonText}>Share suggestion</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Field({
  keyboardType,
  label,
  multiline,
  placeholder,
  trailingIcon,
}: {
  keyboardType?: 'default' | 'url';
  label: string;
  multiline?: boolean;
  placeholder: string;
  trailingIcon?: 'photo';
}) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={[styles.inputShell, multiline && styles.inputShellTall]}>
        <TextInput
          keyboardType={keyboardType}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor="#75695F"
          style={[styles.input, multiline && styles.inputTall]}
        />
        {trailingIcon ? (
          <SymbolView name={{ ios: 'photo', web: 'image' }} size={18} tintColor={Palette.saddleBrown} />
        ) : null}
      </View>
    </View>
  );
}

function MapMarkerPlusIcon() {
  return (
    <View style={styles.markerIcon}>
      <View style={styles.markerPin}>
        <View style={styles.markerPinHole} />
      </View>
      <View style={styles.markerPlusVertical} />
      <View style={styles.markerPlusHorizontal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.cream,
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: Palette.forestMoss,
    borderRadius: 16,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Palette.ink,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  subtitle: {
    color: '#75695F',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  form: {
    gap: 14,
    paddingHorizontal: 18,
  },
  field: {
    gap: 7,
  },
  label: {
    color: Palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: Palette.paper,
    borderColor: Palette.bone,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    paddingHorizontal: 13,
  },
  inputShellTall: {
    alignItems: 'flex-start',
    minHeight: 116,
    paddingTop: 12,
  },
  input: {
    color: Palette.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  inputTall: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  categoryRail: {
    gap: 8,
    paddingRight: 18,
  },
  categoryPill: {
    backgroundColor: Palette.paper,
    borderColor: Palette.bone,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  categoryPillActive: {
    backgroundColor: Palette.sunflowerGold,
    borderColor: Palette.sunflowerGold,
  },
  categoryPillText: {
    color: Palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryPillTextActive: {
    color: Palette.ink,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: Palette.saddleBrown,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 50,
  },
  submitButtonText: {
    color: Palette.paper,
    fontSize: 15,
    fontWeight: '800',
  },
  markerIcon: {
    height: 25,
    position: 'relative',
    width: 26,
  },
  markerPin: {
    alignItems: 'center',
    borderColor: Palette.paper,
    borderRadius: 10,
    borderWidth: 2,
    height: 19,
    justifyContent: 'center',
    left: 1,
    position: 'absolute',
    top: 0,
    transform: [{ rotate: '45deg' }],
    width: 19,
  },
  markerPinHole: {
    backgroundColor: Palette.paper,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  markerPlusHorizontal: {
    backgroundColor: Palette.paper,
    borderRadius: 1,
    height: 3,
    position: 'absolute',
    right: 0,
    top: 8,
    width: 11,
  },
  markerPlusVertical: {
    backgroundColor: Palette.paper,
    borderRadius: 1,
    height: 11,
    position: 'absolute',
    right: 4,
    top: 4,
    width: 3,
  },
});

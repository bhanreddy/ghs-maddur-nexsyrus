import React from 'react';
import { ScrollView, View } from 'react-native';

import { TcA4Document } from './admin/certificate-generator';

const studentData = {
  id: 'qa-student',
  name: 'Anil Kumar Reddy',
  fatherName: 'Srinivas Reddy',
  motherName: 'Lakshmi Devi',
  parentName: 'Srinivas Reddy',
  genderId: 1,
  genderLabel: 'Master',
  class: 'X',
  dob: '14-06-2011',
  dobWords: 'Fourteenth June Two Thousand Eleven',
  admissionNo: '42201',
  academicYear: '2026–2027',
  fromClass: 'I',
  fromYear: '2017–2018',
  toClass: 'X',
  toYear: '2026–2027',
  penNo: '12345678901',
  aadhaarNo: '482196301275',
  religion: 'Hindu',
  address: 'Maddur, Narayanapet District, Telangana',
  nationality: 'Indian',
  category: 'General',
  admissionDate: '10-06-2017',
  lifecycleStatus: 'active',
  isFormerStudent: false,
};

const tcFields = {
  cbseAffiliationNo: '3630128',
  examResult: 'Pursuing',
  qualifiedPromotion: 'Yes',
  promotionClass: 'XI',
  totalWorkingDays: '216',
  workingDaysPresent: '205',
  generalConduct: 'Good',
};

const school = {
  name: 'Geethanjali High School',
  address: 'Narayanapet Road, Maddur, Narayanapet District, Telangana – 509411',
  phone: '9573276939',
  email: 'geetanjalihighschool.vvm@gmail.com',
  website: 'www.ghsmaddur.in',
  affiliation: '',
  recognition: 'Recognised by Govt. of T.S.',
  medium: '',
  logoUrl: '',
  principal: 'Head Master',
};

export default function TcQa() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#E8EBEF' }} contentContainerStyle={{ alignItems: 'center', padding: 24 }}>
      <View style={{ width: 794, height: 1123, backgroundColor: '#FFFEFA' }}>
        <TcA4Document
          studentData={studentData as any}
          tcFields={tcFields as any}
          school={school as any}
          serialNo="TC/2026/010"
          issueDate="03-08-2026"
        />
      </View>
    </ScrollView>
  );
}
